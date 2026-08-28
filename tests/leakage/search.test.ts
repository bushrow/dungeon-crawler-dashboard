/**
 * Search is the newest way into the corpus and the easiest one to leak through.
 *
 * A name is a spoiler. Finding a character before you meet them tells you they
 * exist; finding one by a title they have not earned yet tells you what happens
 * to them. Both are tested here, and search lives in the access layer rather
 * than in a view so there is one implementation to test.
 */
import { describe, expect, it } from 'vitest';
import { loadBundle, horizonAt } from '@dcc/core';
import { unwrap } from '../../packages/core/src/bundle';
import { entity, syntheticBundle } from './synthetic';

const bundle = loadBundle();
const raw = unwrap(bundle);
const floors = Array.from({ length: raw.maxFloor + 1 }, (_, i) => i);

describe.each(floors)('search at floor %i', (floor) => {
  const h = horizonAt(bundle, floor);

  it('returns nothing a reader has not met', () => {
    const visible = new Set(h.entities().map((e) => e.id));
    for (const term of ['a', 'e', 'the', 'carl', 'box', 'skill']) {
      for (const hit of h.search(term, 500)) {
        expect(visible.has(hit.entity.id), `${hit.entity.id} leaked via "${term}"`).toBe(true);
      }
    }
  });

  it('cannot be used to confirm a future entity by name', () => {
    // Searching a future name may still hit a visible entity whose own name
    // contains it, which is not a leak: "Grull" finds the Gauntlet of the
    // Exalted Grull, which the reader is already carrying. What must never
    // happen is the future entity itself coming back.
    for (const future of raw.entities.filter((e) => e.introducedFloor > floor)) {
      const hits = h.search(future.canonicalName, 500);
      expect(hits.map((x) => x.entity.id)).not.toContain(future.id);
    }
  });

  it('never matches on an alias that has not been revealed', () => {
    const withheld = raw.aliases.filter((a) => a.revealFloor > floor);
    for (const alias of withheld) {
      const hits = h.search(alias.alias, 500);
      for (const hit of hits) {
        // A hit is fine if the visible name happens to contain the string; it
        // is not fine for the hit to be reported as matching the alias itself.
        expect(hit.matchedOn).not.toBe(alias.alias);
      }
    }
  });
});

describe('search behaviour', () => {
  const h = horizonAt(bundle, 9);

  it('ignores an empty query rather than returning the whole corpus', () => {
    expect(h.search('')).toEqual([]);
    expect(h.search('   ')).toEqual([]);
  });

  it('is case insensitive and matches partial names', () => {
    expect(h.search('PRINCESS DONUT').length).toBeGreaterThan(0);
    expect(h.search('donut').length).toBeGreaterThan(0);
  });

  it('puts an exact name above a substring match', () => {
    const hits = h.search('carl');
    expect(hits[0]!.entity.canonicalName).toBe('Carl');
  });

  it('honours the limit', () => {
    expect(h.search('a', 5)).toHaveLength(5);
  });
});

describe('an alias revealed later', () => {
  const late = syntheticBundle({
    maxFloor: 6,
    entities: [entity('hero', 1)],
    aliases: [
      { entityId: 'hero', alias: 'Hero', revealFloor: 1 },
      { entityId: 'hero', alias: 'The Kingslayer', revealFloor: 5 },
    ],
  });

  it('is not searchable before its floor', () => {
    // The title encodes the event that earned it, which is the whole reason
    // aliases carry their own reveal floor.
    expect(horizonAt(late, 2).search('Kingslayer')).toEqual([]);
  });

  it('is searchable once revealed', () => {
    const hits = horizonAt(late, 5).search('Kingslayer');
    expect(hits.map((x) => x.matchedOn)).toEqual(['The Kingslayer']);
  });
});

describe('recordFor', () => {
  it('is undefined for an entity the reader has not met', () => {
    expect(horizonAt(bundle, 0).recordFor('mordecai')).toBeUndefined();
  });

  it('assembles what is visible and nothing else', () => {
    const record = horizonAt(bundle, 2).recordFor('borant')!;
    expect(record.entity.canonicalName).toBe('Borant Corporation');
    for (const fact of record.facts) expect(fact.revealFloor).toBeLessThanOrEqual(2);
    for (const edge of record.relationships) expect(edge.revealFloor).toBeLessThanOrEqual(2);
  });

  it('names who is carrying an item, and only while they carry it', () => {
    const atTwo = horizonAt(bundle, 2).recordFor('trollskin_shirt')!;
    expect(atTwo.heldBy.map((x) => x.holder.id)).toContain('carl');
    // Before Carl picks it up, nobody holds it.
    expect(horizonAt(bundle, 0).recordFor('trollskin_shirt')).toBeUndefined();
  });
});
