/**
 * Class 1: the property test.
 *
 * For every floor and every access method, nothing comes back that the reader
 * could not know. Generative and cheap, and it catches most regressions before
 * anything more specific has to.
 */
import { describe, expect, it } from 'vitest';
import { loadBundle, horizonAt } from '@dcc/core';
import { unwrap } from '../../packages/core/src/bundle';

const bundle = loadBundle();
const raw = unwrap(bundle);
const floors = Array.from({ length: raw.maxFloor + 1 }, (_, i) => i);

describe.each(floors)('at floor %i', (floor) => {
  const h = horizonAt(bundle, floor);
  const ids = h.entities().map((e) => e.id);

  it('reveals no entity before its introduction', () => {
    for (const e of h.entities()) expect(e.introducedFloor).toBeLessThanOrEqual(floor);
  });

  it('reveals no alias early', () => {
    for (const id of ids) {
      for (const a of h.aliasesFor(id)) expect(a.revealFloor).toBeLessThanOrEqual(floor);
    }
  });

  it('reveals no fact early', () => {
    for (const id of ids) {
      for (const f of h.factsFor(id)) expect(f.revealFloor).toBeLessThanOrEqual(floor);
    }
  });

  it('withholds every gloss whose significance floor is ahead', () => {
    const bySignificance = new Map(raw.facts.map((f) => [f.id, f.significanceFloor]));
    for (const id of ids) {
      for (const f of h.factsFor(id)) {
        if (bySignificance.get(f.id)! > floor) {
          expect(f.gloss, `fact ${f.id} leaked its gloss at floor ${floor}`).toBeNull();
        }
      }
    }
  });

  it('reveals no status early', () => {
    for (const id of ids) {
      const s = h.statusFor(id);
      if (s) expect(s.revealFloor).toBeLessThanOrEqual(floor);
    }
  });

  it('reveals no edge early, and none that has already ended', () => {
    for (const e of h.edges()) {
      expect(e.revealFloor).toBeLessThanOrEqual(floor);
      if (e.endedRevealFloor !== null) expect(e.endedRevealFloor).toBeGreaterThan(floor);
    }
  });

  it('draws no edge to an entity that is not visible', () => {
    const visible = new Set(ids);
    for (const e of h.edges()) {
      expect(visible.has(e.src)).toBe(true);
      expect(visible.has(e.dst)).toBe(true);
    }
  });

  it('reveals no mechanics row early', () => {
    for (const m of h.mechanics()) expect(m.introducedFloor).toBeLessThanOrEqual(floor);
  });

  it('reveals no holding early, and none already lost', () => {
    for (const id of ids) {
      for (const held of h.holdingsFor(id)) {
        expect(held.revealFloor).toBeLessThanOrEqual(floor);
        if (held.endedRevealFloor !== null) expect(held.endedRevealFloor).toBeGreaterThan(floor);
      }
    }
  });

  it('never puts a thing on a sheet before the reader meets the thing', () => {
    const visible = new Set(ids);
    for (const id of ids) {
      for (const held of h.holdingsFor(id)) expect(visible.has(held.heldId)).toBe(true);
    }
  });

  it('reveals no stat line from a floor ahead', () => {
    for (const id of ids) {
      const line = h.statsFor(id);
      if (line) expect(line.floor).toBeLessThanOrEqual(floor);
    }
  });

  it('builds a sheet only from records visible now', () => {
    for (const id of h.sheetIds()) {
      const sheet = h.sheetFor(id)!;
      expect(sheet.statsAsOf === null || sheet.statsAsOf <= floor).toBe(true);
      for (const held of [...sheet.gear, ...sheet.skills, ...sheet.spells]) {
        expect(held.revealFloor).toBeLessThanOrEqual(floor);
        expect(held.entity.introducedFloor).toBeLessThanOrEqual(floor);
      }
    }
  });

  it('places no node that is not visible', () => {
    const visible = new Set(ids);
    for (const n of h.nodes()) expect(visible.has(n.entity.id)).toBe(true);
  });

  it('returns nothing at all for an entity that does not exist yet', () => {
    const future = raw.entities.filter((e) => e.introducedFloor > floor);
    for (const e of future) {
      expect(h.entity(e.id)).toBeUndefined();
      expect(h.aliasesFor(e.id)).toEqual([]);
      expect(h.factsFor(e.id)).toEqual([]);
      expect(h.statusFor(e.id)).toBeUndefined();
      expect(h.edgesFor(e.id)).toEqual([]);
      expect(h.holdingsFor(e.id)).toEqual([]);
      expect(h.statsFor(e.id)).toBeUndefined();
      expect(h.sheetFor(e.id)).toBeUndefined();
    }
  });
});

it('clamps a floor outside the corpus instead of throwing', () => {
  expect(horizonAt(bundle, -5).floor).toBe(0);
  expect(horizonAt(bundle, 999).floor).toBe(raw.maxFloor);
  expect(horizonAt(bundle, Number.NaN).floor).toBe(0);
  expect(horizonAt(bundle, 2.7).floor).toBe(2);
});

it('hands apps no way to reach a row', () => {
  // The opaque handle carries no enumerable data. Apps get Horizon or nothing.
  expect(Object.keys(bundle)).toEqual([]);
  expect(JSON.stringify(bundle)).toBe('{}');
});
