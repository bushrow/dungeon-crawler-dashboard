/** Record shapes in the compiled bundle. Mirrors data/SCHEMA.md. */

export type EntityType =
  | 'character'
  | 'faction'
  | 'class'
  | 'skill'
  | 'item'
  | 'title'
  | 'location'
  | 'monster';

export type Confidence = 'certain' | 'probable' | 'inferred';
export type StatusValue = 'active' | 'departed' | 'unknown';
export type EdgeType = 'allied' | 'hostile' | 'kin' | 'sponsor' | 'subordinate' | 'party';
export type CostType =
  | 'gold'
  | 'slot'
  | 'cooldown'
  | 'health'
  | 'stamina'
  | 'mana'
  | 'sacrifice'
  | 'none';
export type EffectCategory =
  | 'damage'
  | 'defense'
  | 'mobility'
  | 'utility'
  | 'economy'
  | 'social'
  | 'information';

export interface Entity {
  id: string;
  type: EntityType;
  canonicalName: string;
  /** Reveal clock: the floor at which a reader first meets this entity. */
  introducedFloor: number;
  notes: string | null;
}

export interface Alias {
  entityId: string;
  alias: string;
  revealFloor: number;
}

export interface Status {
  entityId: string;
  status: StatusValue;
  eventFloor: number;
  revealFloor: number;
}

export interface Edge {
  src: string;
  dst: string;
  type: EdgeType;
  eventFloor: number;
  revealFloor: number;
  endedEventFloor: number | null;
  endedRevealFloor: number | null;
  confidence: Confidence;
}

/**
 * A fact as returned by the access layer.
 *
 * `gloss` is the interpretive text, and it is present only when the horizon has
 * reached the fact's significance floor. Gating it structurally rather than with
 * a boolean means a caller cannot render withheld text by forgetting a check:
 * the string is not in the object.
 */
export interface VisibleFact {
  id: string;
  subjectId: string;
  predicate: string;
  object: string;
  eventFloor: number;
  revealFloor: number;
  source: string;
  confidence: Confidence;
  gloss: string | null;
}

export interface Mechanic {
  entityId: string;
  costType: CostType;
  costValue: string | null;
  effectCategory: EffectCategory;
  effectScale: number;
  duration: string | null;
  restrictions: string | null;
  introducedFloor: number;
  source: string;
  confidence: Confidence;
}

/** A mechanics row joined to its entity, which is what the Ledger renders. */
export interface PricedEntity extends Mechanic {
  name: string;
  type: EntityType;
  /** costValue parsed as a number, or null when the price is not quantified. */
  costNumeric: number | null;
}

export interface Point {
  x: number;
  y: number;
}

/** A graph-drawable entity at its frozen coordinates. */
export interface GraphNode {
  entity: Entity;
  position: Point;
}

export interface Coverage {
  floor: number;
  entitiesVisible: number;
  entitiesByType: Partial<Record<EntityType, number>>;
  edgesVisible: number;
  factsVisible: number;
  mechanicsVisible: number;
  mechanicsByConfidence: Record<Confidence, number>;
  /** Rows that count toward headline numbers, meaning confidence is not inferred. */
  mechanicsScored: number;
  /** Visible rows excluded from headline numbers because they are inferred. */
  mechanicsExcluded: number;
  /** Visible rows whose cost is an actual number rather than free text. */
  mechanicsPriced: number;
}
