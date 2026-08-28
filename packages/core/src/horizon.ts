import type { Bundle } from './bundle';
import { unwrap } from './bundle';
import type {
  Alias,
  Confidence,
  HeldEntity,
  Sheet,
  StatLine,
  Coverage,
  Edge,
  Entity,
  EntityType,
  GraphNode,
  PricedEntity,
  Status,
  VisibleFact,
} from './types';

/**
 * A read of the corpus at one floor.
 *
 * Every method filters on the reveal clock. Nothing here consults the event
 * clock for visibility, and no caller is trusted to filter afterwards.
 */
export class Horizon {
  private constructor(
    private readonly bundle: Bundle,
    readonly floor: number,
  ) {}

  static at(bundle: Bundle, floor: number): Horizon {
    const { maxFloor } = unwrap(bundle);
    // Clamp rather than throw. A slider, a URL, and a stale localStorage value
    // can all hand us a floor outside the corpus, and none of those is an error
    // worth failing a render over.
    const clamped = Number.isFinite(floor) ? Math.min(Math.max(Math.trunc(floor), 0), maxFloor) : 0;
    return new Horizon(bundle, clamped);
  }

  get maxFloor(): number {
    return unwrap(this.bundle).maxFloor;
  }

  entities(): Entity[] {
    return unwrap(this.bundle)
      .entities.filter((e) => e.introducedFloor <= this.floor)
      .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
  }

  entity(id: string): Entity | undefined {
    const found = unwrap(this.bundle).entities.find((e) => e.id === id);
    return found && found.introducedFloor <= this.floor ? found : undefined;
  }

  aliasesFor(id: string): Alias[] {
    if (!this.entity(id)) return [];
    return unwrap(this.bundle)
      .aliases.filter((a) => a.entityId === id && a.revealFloor <= this.floor)
      .sort((a, b) => a.revealFloor - b.revealFloor || a.alias.localeCompare(b.alias));
  }

  factsFor(id: string): VisibleFact[] {
    if (!this.entity(id)) return [];
    return unwrap(this.bundle)
      .facts.filter((f) => f.subjectId === id && f.revealFloor <= this.floor)
      .map(({ significanceFloor, notes, ...rest }) => ({
        ...rest,
        // The claim is safe at revealFloor. The reading of it is not safe until
        // significanceFloor, so it is simply absent until then.
        gloss: significanceFloor <= this.floor ? notes : null,
      }))
      .sort((a, b) => a.revealFloor - b.revealFloor || a.id.localeCompare(b.id));
  }

  /**
   * The latest revealed status, or undefined.
   *
   * Undefined means "nothing to say", and callers must render nothing at all.
   * It does not mean active, and the absence of a row is never evidence of one:
   * inferring here would turn missing data into a statement about which
   * characters have something coming.
   */
  statusFor(id: string): Status | undefined {
    if (!this.entity(id)) return undefined;
    const visible = unwrap(this.bundle).status.filter(
      (s) => s.entityId === id && s.revealFloor <= this.floor,
    );
    if (visible.length === 0) return undefined;
    return visible.reduce((latest, s) =>
      s.revealFloor > latest.revealFloor || (s.revealFloor === latest.revealFloor && s.eventFloor > latest.eventFloor)
        ? s
        : latest,
    );
  }

  edges(): Edge[] {
    const visibleIds = new Set(this.entities().map((e) => e.id));
    return unwrap(this.bundle)
      .edges.filter(
        (e) =>
          e.revealFloor <= this.floor &&
          !(e.endedRevealFloor !== null && e.endedRevealFloor <= this.floor) &&
          visibleIds.has(e.src) &&
          visibleIds.has(e.dst),
      )
      .sort((a, b) => a.src.localeCompare(b.src) || a.dst.localeCompare(b.dst) || a.type.localeCompare(b.type));
  }

  /** Graph-drawable entities at their frozen coordinates. */
  nodes(): GraphNode[] {
    const { layout } = unwrap(this.bundle);
    return this.entities()
      .filter((e) => layout[e.id] !== undefined)
      .map((e) => ({ entity: e, position: layout[e.id]! }));
  }

  edgesFor(id: string): Edge[] {
    return this.edges().filter((e) => e.src === id || e.dst === id);
  }

  mechanics(): PricedEntity[] {
    const byId = new Map(this.entities().map((e) => [e.id, e]));
    return unwrap(this.bundle)
      .mechanics.filter((m) => m.introducedFloor <= this.floor && byId.has(m.entityId))
      .map((m) => {
        const entity = byId.get(m.entityId)!;
        const parsed = m.costValue === null ? Number.NaN : Number(m.costValue);
        return {
          ...m,
          name: entity.canonicalName,
          type: entity.type,
          costNumeric: Number.isFinite(parsed) ? parsed : null,
        };
      })
      .sort((a, b) => a.effectCategory.localeCompare(b.effectCategory) || a.name.localeCompare(b.name));
  }

  /**
   * Everything one crawler is carrying and knows at this floor.
   *
   * A holding is visible on the same terms as an edge: revealed by now, and not
   * already known to have ended. Gear picked up on floor 1 and lost on floor 2
   * leaves the sheet exactly when the reader learns it was lost.
   */
  holdingsFor(id: string): HeldEntity[] {
    if (!this.entity(id)) return [];
    const byId = new Map(this.entities().map((e) => [e.id, e]));
    return unwrap(this.bundle)
      .holdings.filter(
        (h) =>
          h.entityId === id &&
          h.revealFloor <= this.floor &&
          !(h.endedRevealFloor !== null && h.endedRevealFloor <= this.floor) &&
          byId.has(h.heldId),
      )
      .map((h) => ({ ...h, entity: byId.get(h.heldId)! }))
      .sort(
        (a, b) =>
          (a.slot ?? '').localeCompare(b.slot ?? '') ||
          a.entity.canonicalName.localeCompare(b.entity.canonicalName),
      );
  }

  /**
   * The most recent stat line at or before the horizon.
   *
   * Later floors do not always have one recorded, so this can lag. `sheetFor`
   * reports which floor it came from rather than implying it is current.
   */
  statsFor(id: string): StatLine | undefined {
    if (!this.entity(id)) return undefined;
    const visible = unwrap(this.bundle).stats.filter(
      (s) => s.entityId === id && s.floor <= this.floor,
    );
    if (visible.length === 0) return undefined;
    return visible.reduce((latest, s) => (s.floor > latest.floor ? s : latest));
  }

  /** Crawlers the corpus can actually build a sheet for, at this floor. */
  sheetIds(): string[] {
    const data = unwrap(this.bundle);
    const ids = new Set<string>();
    for (const h of data.holdings) if (h.revealFloor <= this.floor) ids.add(h.entityId);
    for (const s of data.stats) if (s.floor <= this.floor) ids.add(s.entityId);
    return [...ids].filter((id) => this.entity(id) !== undefined).sort();
  }

  sheetFor(id: string): Sheet | undefined {
    const character = this.entity(id);
    if (!character) return undefined;
    const held = this.holdingsFor(id);
    const stats = this.statsFor(id);
    return {
      character,
      stats: stats ?? null,
      statsAsOf: stats ? stats.floor : null,
      races: held.filter((h) => h.kind === 'race'),
      classes: held.filter((h) => h.kind === 'class'),
      gear: held.filter((h) => h.kind === 'gear'),
      skills: held.filter((h) => h.kind === 'skill'),
      spells: held.filter((h) => h.kind === 'spell'),
    };
  }

  /**
   * What is measurable at this floor, shown next to what was measured.
   *
   * Every count here is over the filtered set. Nothing counts withheld records:
   * reporting "4 facts have a gloss you cannot see yet" would leak the existence
   * of the withheld material, which is the same failure as styling a node
   * differently because its status is missing.
   */
  coverage(): Coverage {
    const entities = this.entities();
    const mechanics = this.mechanics();

    const entitiesByType: Partial<Record<EntityType, number>> = {};
    for (const e of entities) entitiesByType[e.type] = (entitiesByType[e.type] ?? 0) + 1;

    const byConfidence: Record<Confidence, number> = { certain: 0, probable: 0, inferred: 0 };
    for (const m of mechanics) byConfidence[m.confidence] += 1;

    return {
      floor: this.floor,
      entitiesVisible: entities.length,
      entitiesByType,
      edgesVisible: this.edges().length,
      factsVisible: entities.reduce((n, e) => n + this.factsFor(e.id).length, 0),
      mechanicsVisible: mechanics.length,
      mechanicsByConfidence: byConfidence,
      mechanicsScored: mechanics.filter((m) => m.confidence !== 'inferred').length,
      mechanicsExcluded: byConfidence.inferred,
      mechanicsPriced: mechanics.filter((m) => m.costNumeric !== null).length,
    };
  }
}

export function horizonAt(bundle: Bundle, floor: number): Horizon {
  return Horizon.at(bundle, floor);
}
