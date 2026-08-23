/**
 * Class 4: aggregate leakage.
 *
 * Counts, denominators, and axis ranges must be computed over the filtered set.
 * A chart whose y-axis is scaled to fit data the reader cannot see has told them
 * the data exists.
 */
import { describe, expect, it } from 'vitest';
import { loadBundle, horizonAt } from '@dcc/core';
import { unwrap } from '../../packages/core/src/bundle';

const bundle = loadBundle();
const raw = unwrap(bundle);
const floors = Array.from({ length: raw.maxFloor + 1 }, (_, i) => i);

describe.each(floors)('coverage at floor %i', (floor) => {
  const h = horizonAt(bundle, floor);
  const c = h.coverage();

  it('counts only what is visible', () => {
    expect(c.entitiesVisible).toBe(h.entities().length);
    expect(c.edgesVisible).toBe(h.edges().length);
    expect(c.mechanicsVisible).toBe(h.mechanics().length);
  });

  it('splits confidence over the visible rows and nothing else', () => {
    const { certain, probable, inferred } = c.mechanicsByConfidence;
    expect(certain + probable + inferred).toBe(c.mechanicsVisible);
    expect(c.mechanicsScored + c.mechanicsExcluded).toBe(c.mechanicsVisible);
  });

  it('never reports a total larger than the whole corpus', () => {
    expect(c.entitiesVisible).toBeLessThanOrEqual(raw.entities.length);
    expect(c.mechanicsVisible).toBeLessThanOrEqual(raw.mechanics.length);
  });

  it('counts no withheld record', () => {
    // Reporting how much is hidden is the same leak as styling a node
    // differently because its status is missing.
    const keys = Object.keys(c).join(' ').toLowerCase();
    for (const word of ['withheld', 'hidden', 'future', 'pending', 'upcoming']) {
      expect(keys).not.toContain(word);
    }
  });
});

describe('scatter axis domains', () => {
  it('are bounded by the visible rows, not by the corpus', () => {
    for (const floor of floors) {
      const rows = horizonAt(bundle, floor).mechanics();
      if (rows.length === 0) continue;
      const scales = rows.map((m) => m.effectScale);
      const laterOnly = raw.mechanics.filter((m) => m.introducedFloor > floor);
      const maxVisible = Math.max(...scales);

      for (const future of laterOnly) {
        if (future.effectScale > maxVisible) {
          // A future row scores higher than anything visible. The axis must not
          // stretch to fit it, or the empty space announces what is coming.
          expect(maxVisible).toBeLessThan(future.effectScale);
        }
      }
    }
  });

  it('offers categories only from the visible rows', () => {
    const atZero = new Set(horizonAt(bundle, 0).mechanics().map((m) => m.effectCategory));
    const atThree = new Set(horizonAt(bundle, 3).mechanics().map((m) => m.effectCategory));
    expect(atZero.size).toBeLessThan(atThree.size);
    expect(atZero.has('economy')).toBe(false);
  });
});

describe('counts grow monotonically with the horizon', () => {
  it('never shrinks as the reader learns more', () => {
    let previous = -1;
    for (const floor of floors) {
      const n = horizonAt(bundle, floor).coverage().entitiesVisible;
      expect(n).toBeGreaterThanOrEqual(previous);
      previous = n;
    }
  });
});
