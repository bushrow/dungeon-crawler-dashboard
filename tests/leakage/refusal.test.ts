/**
 * Class 3: matched-pair refusal.
 *
 * Two entities identical in everything a reader can see, differing only in
 * whether something happens to one of them later. The access layer must be
 * unable to tell them apart, because the shape of a refusal is itself an answer.
 */
import { describe, expect, it } from 'vitest';
import { horizonAt } from '@dcc/core';
import { entity, syntheticBundle } from './synthetic';

/**
 * `doomed` departs on floor 5. `spared` never does. At floor 2 a reader knows
 * neither fact, so every observable must match.
 */
const matched = syntheticBundle({
  maxFloor: 6,
  entities: [entity('doomed', 1), entity('spared', 1)],
  status: [
    { entityId: 'doomed', status: 'active', eventFloor: 1, revealFloor: 1 },
    { entityId: 'spared', status: 'active', eventFloor: 1, revealFloor: 1 },
    { entityId: 'doomed', status: 'departed', eventFloor: 5, revealFloor: 5 },
  ],
});

describe('before the reveal', () => {
  const h = horizonAt(matched, 2);

  it('reports the same status for both', () => {
    expect(h.statusFor('doomed')?.status).toBe('active');
    expect(h.statusFor('spared')?.status).toBe('active');
  });

  it('returns records that differ in no field once the entity id is set aside', () => {
    const strip = (id: string) => {
      const s = h.statusFor(id);
      return s ? { ...s, entityId: '' } : s;
    };
    expect(strip('doomed')).toEqual(strip('spared'));
  });
});

describe('after the reveal', () => {
  it('finally distinguishes them', () => {
    const h = horizonAt(matched, 5);
    expect(h.statusFor('doomed')?.status).toBe('departed');
    expect(h.statusFor('spared')?.status).toBe('active');
  });
});

describe('an entity with no status row at all', () => {
  const quiet = syntheticBundle({
    maxFloor: 6,
    entities: [entity('unrecorded', 1), entity('recorded', 1)],
    status: [{ entityId: 'recorded', status: 'active', eventFloor: 1, revealFloor: 1 }],
  });

  it('returns undefined rather than inferring activity', () => {
    // Absence of a row is missing data, not a claim. Inferring 'active' here
    // would be a guess presented as a fact.
    expect(horizonAt(quiet, 2).statusFor('unrecorded')).toBeUndefined();
  });

  it('is indistinguishable from an entity whose status is withheld', () => {
    const withheld = syntheticBundle({
      maxFloor: 6,
      entities: [entity('unrecorded', 1)],
      status: [{ entityId: 'unrecorded', status: 'departed', eventFloor: 4, revealFloor: 4 }],
    });
    // One has no status row; the other has one the reader cannot see yet. If
    // these two answers differed, the difference would announce the departure.
    expect(horizonAt(quiet, 2).statusFor('unrecorded')).toEqual(
      horizonAt(withheld, 2).statusFor('unrecorded'),
    );
  });
});

describe('an entity that arrives later', () => {
  const late = syntheticBundle({
    maxFloor: 6,
    entities: [entity('present', 1), entity('later', 4)],
    aliases: [{ entityId: 'later', alias: 'The Latecomer', revealFloor: 4 }],
    status: [{ entityId: 'later', status: 'active', eventFloor: 4, revealFloor: 4 }],
  });

  it('is indistinguishable from an entity that never exists', () => {
    const h = horizonAt(late, 2);
    const absent = horizonAt(syntheticBundle({ maxFloor: 6, entities: [entity('present', 1)] }), 2);

    expect(h.entity('later')).toEqual(absent.entity('nobody'));
    expect(h.aliasesFor('later')).toEqual(absent.aliasesFor('nobody'));
    expect(h.statusFor('later')).toEqual(absent.statusFor('nobody'));
    expect(h.factsFor('later')).toEqual(absent.factsFor('nobody'));
  });
});
