/** Record shapes in the compiled bundle. Mirrors data/SCHEMA.md. */

/**
 * Enum values, as runtime arrays with the unions derived from them.
 *
 * These mirror `pipeline/dcc_pipeline/schema.py`. Keeping them as arrays rather
 * than bare unions makes the drift detectable: `types.test.ts` checks every
 * value in the shipped bundle against these, so adding a cost type in Python
 * without adding it here fails a test instead of silently narrowing.
 */
export const ENTITY_TYPES = [
  'character',
  'faction',
  'class',
  'race',
  'skill',
  'item',
  'title',
  'location',
  'monster',
] as const;

export const HOLDING_KINDS = ['gear', 'skill', 'spell', 'class', 'race'] as const;

export const CONFIDENCE_LEVELS = ['certain', 'probable', 'inferred'] as const;
export const STATUS_VALUES = ['active', 'departed', 'unknown'] as const;
export const EDGE_TYPES = ['allied', 'hostile', 'kin', 'sponsor', 'subordinate', 'party'] as const;
export const COST_TYPES = [
  'gold',
  'slot',
  'views',
  'skill',
  'achievement',
  'cooldown',
  'health',
  'stamina',
  'mana',
  'sacrifice',
  'none',
] as const;
export const EFFECT_CATEGORIES = [
  'damage',
  'defense',
  'mobility',
  'utility',
  'economy',
  'social',
  'information',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];
export type HoldingKind = (typeof HOLDING_KINDS)[number];
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];
export type StatusValue = (typeof STATUS_VALUES)[number];
export type EdgeType = (typeof EDGE_TYPES)[number];
export type CostType = (typeof COST_TYPES)[number];
export type EffectCategory = (typeof EFFECT_CATEGORIES)[number];

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

/** A thing a crawler has, with the floor they got it and the floor they lost it. */
export interface Holding {
  entityId: string;
  heldId: string;
  kind: HoldingKind;
  slot: string | null;
  level: number | null;
  eventFloor: number;
  revealFloor: number;
  endedEventFloor: number | null;
  endedRevealFloor: number | null;
  source: string;
  confidence: Confidence;
}

/** End-of-floor stat line. */
export interface StatLine {
  entityId: string;
  floor: number;
  /** Every field but the floor is optional: the source records a level for
   *  almost every book but a full attribute line for only a few. */
  level: number | null;
  str: number | null;
  int: number | null;
  con: number | null;
  dex: number | null;
  cha: number | null;
  source: string;
  confidence: Confidence;
}

/** A holding joined to the entity it points at, which is what a sheet renders. */
export interface HeldEntity extends Holding {
  entity: Entity;
}

/**
 * One crawler's character sheet at a horizon.
 *
 * `statsAsOf` is the floor the stat line actually comes from, which can lag the
 * horizon when a later floor has no recorded stats. Showing the last known line
 * and saying which floor it came from beats showing nothing.
 */
export interface Sheet {
  character: Entity;
  stats: StatLine | null;
  statsAsOf: number | null;
  /** Highest floor any visible holding was recorded on, so a stale kit says so. */
  kitAsOf: number | null;
  races: HeldEntity[];
  classes: HeldEntity[];
  gear: HeldEntity[];
  skills: HeldEntity[];
  spells: HeldEntity[];
}

/**
 * Everything the corpus holds on one entity at a horizon.
 *
 * Named CorpusRecord rather than Record: the latter is TypeScript's own mapped
 * type, used elsewhere in this file.
 */
export interface CorpusRecord {
  entity: Entity;
  aliases: Alias[];
  status: Status | null;
  facts: VisibleFact[];
  /** Relationships, for entities the graph draws. */
  relationships: Edge[];
  /** Its cost and effect, when it has a priced record. */
  price: PricedEntity | null;
  /** Crawlers carrying or knowing it. */
  heldBy: { holder: Entity; holding: Holding }[];
}

export interface SearchHit {
  entity: Entity;
  /** Why it matched: the entity name, or the alias that did. */
  matchedOn: string;
}
