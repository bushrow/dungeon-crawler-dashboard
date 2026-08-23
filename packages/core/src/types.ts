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
