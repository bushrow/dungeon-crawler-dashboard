import { wrap } from '../../packages/core/src/bundle';
import type { BundleData } from '../../packages/core/src/bundle';

/** Build a bundle in memory, for cases the real corpus does not contain. */
export function syntheticBundle(overrides: Partial<BundleData> = {}) {
  const base: BundleData = {
    version: 'test',
    maxFloor: 6,
    entities: [],
    aliases: [],
    facts: [],
    status: [],
    edges: [],
    mechanics: [],
    holdings: [],
    stats: [],
    layout: {},
    layoutExtent: { width: 1800, height: 980 },
  };
  return wrap({ ...base, ...overrides });
}

export function entity(id: string, introducedFloor: number, type = 'character' as const) {
  return { id, type, canonicalName: id, introducedFloor, notes: null };
}
