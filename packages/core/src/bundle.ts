import bundleJson from '../../../data/dist/dcc-bundle.json';
import type { Alias, Edge, Entity, Mechanic, Point, Status } from './types';

/** The raw bundle shape. Deliberately not exported from the package index. */
export interface BundleData {
  version: string;
  maxFloor: number;
  entities: Entity[];
  aliases: Alias[];
  facts: RawFact[];
  status: Status[];
  edges: Edge[];
  mechanics: Mechanic[];
  layout: Record<string, Point>;
}

export interface RawFact {
  id: string;
  subjectId: string;
  predicate: string;
  object: string;
  eventFloor: number;
  revealFloor: number;
  significanceFloor: number;
  source: string;
  confidence: Mechanic['confidence'];
  notes: string | null;
}

declare const opaque: unique symbol;

/**
 * A loaded bundle.
 *
 * Opaque on purpose. Apps hold one and hand it to `horizonAt`, and the type
 * gives them no way to reach a row. Spoiler safety is then a property of the
 * package rather than a rule each view has to remember.
 */
export interface Bundle {
  readonly [opaque]: true;
}

const inner = new WeakMap<Bundle, BundleData>();

export function wrap(data: BundleData): Bundle {
  const handle = {} as Bundle;
  inner.set(handle, data);
  return handle;
}

export function unwrap(bundle: Bundle): BundleData {
  const data = inner.get(bundle);
  if (!data) throw new Error('not a bundle produced by loadBundle()');
  return data;
}

let cached: Bundle | undefined;

export function loadBundle(): Bundle {
  // JSON modules infer wide types (`string` rather than the EntityType union),
  // so a direct cast is rejected. The pipeline validator is what actually
  // guards the shape, and it runs before the file is ever written.
  cached ??= wrap(bundleJson as unknown as BundleData);
  return cached;
}

export function maxFloorOf(bundle: Bundle): number {
  return unwrap(bundle).maxFloor;
}

export function versionOf(bundle: Bundle): string {
  return unwrap(bundle).version;
}
