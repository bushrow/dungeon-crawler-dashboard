/**
 * Class 2: golden fixtures.
 *
 * Hand-written expected output at three horizons. The property test proves
 * nothing leaks; these prove the right things are actually present, which is the
 * failure a filter that returns nothing would otherwise pass.
 */
import { describe, expect, it } from 'vitest';
import { loadBundle, horizonAt } from '@dcc/core';

const bundle = loadBundle();

describe('floor 0, the surface', () => {
  const h = horizonAt(bundle, 0);

  it('shows only what the prologue establishes', () => {
    expect(h.entities().map((e) => e.id).sort()).toEqual([
      'bea',
      'boxer_shorts',
      'carl',
      'combat_boots',
      'crawlers',
      'donut',
      'surface',
      'the_system',
    ]);
  });

  it('has not introduced the operator yet', () => {
    expect(h.entity('borant')).toBeUndefined();
    expect(h.entity('mordecai')).toBeUndefined();
  });

  it('draws the five relationships the prologue establishes', () => {
    expect(h.edges().map((e) => `${e.src}-${e.dst}:${e.type}`).sort()).toEqual([
      'carl-bea:kin',
      'carl-crawlers:subordinate',
      'carl-donut:party',
      'donut-bea:kin',
      'donut-crawlers:subordinate',
    ]);
  });

  it('prices only what Carl walked in wearing', () => {
    expect(h.mechanics().map((m) => m.entityId).sort()).toEqual(['boxer_shorts', 'combat_boots']);
  });

  it('knows Donut by her show names', () => {
    expect(h.aliasesFor('donut').map((a) => a.alias)).toContain('Grand Champion');
    expect(h.aliasesFor('donut').map((a) => a.alias)).not.toContain('Former Child Actor');
  });
});

describe('floor 1, the first floor', () => {
  const h = horizonAt(bundle, 1);

  it('has introduced the operator and the safe rooms', () => {
    expect(h.entity('borant')?.canonicalName).toBe('Borant Corporation');
    expect(h.entity('bopca')?.canonicalName).toBe('The Bopca');
    expect(h.entity('safe_room')).toBeDefined();
  });

  it('still has no trainer', () => {
    expect(h.entity('mordecai')).toBeUndefined();
    expect(h.edges().some((e) => e.src === 'mordecai' || e.dst === 'mordecai')).toBe(false);
  });

  it('counts 18 entities', () => {
    expect(h.entities()).toHaveLength(18);
  });
});

describe('floor 3, the Over City', () => {
  const h = horizonAt(bundle, 3);

  it('has the whole v1 corpus', () => {
    expect(h.entities()).toHaveLength(34);
    expect(h.mechanics()).toHaveLength(13);
  });

  it('has both classes, chosen at third-floor selection', () => {
    const classes = h.entities().filter((e) => e.type === 'class').map((e) => e.id);
    expect(classes.sort()).toEqual(['compensated_anarchist', 'former_child_actor']);
  });
});

describe('a gloss that lands after its claim', () => {
  const budgetOperator = (floor: number) =>
    horizonAt(bundle, floor).factsFor('borant').find((f) => f.id === 'f011');

  it('is not visible at all before the claim is revealed', () => {
    expect(budgetOperator(1)).toBeUndefined();
  });

  it('shows the claim without its reading at floor 2', () => {
    const fact = budgetOperator(2);
    expect(fact).toBeDefined();
    expect(fact!.object).toContain('budget operator');
    expect(fact!.gloss).toBeNull();
  });

  it('shows the reading once the horizon reaches it', () => {
    expect(budgetOperator(3)!.gloss).toContain('cost-cutting');
  });
});
