/**
 * Class 2: golden fixtures.
 *
 * Hand-written expected output at three horizons. The property test proves
 * nothing leaks; these prove the right things are actually present, which is the
 * failure a filter that returned nothing would otherwise pass.
 */
import { describe, expect, it } from 'vitest';
import { loadBundle, horizonAt } from '@dcc/core';

const bundle = loadBundle();

describe('floor 0, before the dungeon', () => {
  const h = horizonAt(bundle, 0);

  it('shows only what the opening establishes', () => {
    expect(h.entities().map((e) => e.id).sort()).toEqual([
      'beatrice',
      'carl',
      'cat',
      'crawlers',
      'donut',
      'dungeon',
      'dungeon_entrance',
      'human',
      'leather_coat',
      'monobrow_sam',
      'pink_crocs',
      'surface',
      'the_system',
      'zippo',
    ]);
  });

  it('has not introduced the operator or the trainer yet', () => {
    expect(h.entity('borant')).toBeUndefined();
    expect(h.entity('mordecai')).toBeUndefined();
  });

  it('draws the six relationships the opening establishes', () => {
    expect(h.edges().map((e) => `${e.src}-${e.dst}:${e.type}`).sort()).toEqual([
      'carl-beatrice:kin',
      'carl-crawlers:subordinate',
      'carl-donut:party',
      'carl-monobrow_sam:allied',
      'donut-beatrice:kin',
      'donut-crawlers:subordinate',
    ]);
  });

  it('prices only what Carl walked in with, plus the default race', () => {
    expect(h.mechanics().map((m) => m.entityId).sort()).toEqual([
      'human',
      'leather_coat',
      'pink_crocs',
      'zippo',
    ]);
  });

  it('knows Donut by her show name but not her class title', () => {
    const aliases = h.aliasesFor('donut').map((a) => a.alias);
    expect(aliases).toContain('Princess Donut the Queen Anne Chonk');
    expect(aliases).not.toContain('Former Child Actor');
  });
});

describe('floor 1, the first tutorial floor', () => {
  const h = horizonAt(bundle, 1);

  it('has introduced the operator, the trainer, and the safe rooms', () => {
    expect(h.entity('borant')?.canonicalName).toBe('Borant Corporation');
    expect(h.entity('mordecai')?.canonicalName).toBe('Mordecai');
    expect(h.entity('safe_room')).toBeDefined();
  });

  it('has no third-floor class yet', () => {
    expect(h.entities().filter((e) => e.type === 'class')).toEqual([]);
    expect(h.entity('compensated_anarchist')).toBeUndefined();
  });

  it('counts 85 entities, 28 relationships, and 47 priced records', () => {
    expect(h.entities()).toHaveLength(85);
    expect(h.edges()).toHaveLength(28);
    expect(h.mechanics()).toHaveLength(47);
  });
});

describe('floor 3, the Over City', () => {
  const h = horizonAt(bundle, 3);

  it('has the whole v1 corpus', () => {
    expect(h.entities()).toHaveLength(125);
    expect(h.edges()).toHaveLength(53);
    expect(h.mechanics()).toHaveLength(66);
  });

  it('has every third-floor class', () => {
    const classes = h.entities().filter((e) => e.type === 'class').map((e) => e.id);
    expect(classes.sort()).toEqual([
      'artist_alley_mogul',
      'blizzardmancer',
      'bomb_squad_tech',
      'compensated_anarchist',
      'former_child_actor',
      'monster_truck_driver',
      'necrobard',
      'prizefighter',
      'shieldmaiden',
      'swashbuckler',
    ]);
  });

  it('prices the two lead classes by audience, in views', () => {
    const priced = h.mechanics().filter((m) => m.costType === 'views');
    expect(priced.map((m) => m.entityId).sort()).toEqual([
      'compensated_anarchist',
      'former_child_actor',
    ]);
    // Donut's class costs twice what Carl's does, and both are real numbers.
    expect(priced.find((m) => m.entityId === 'compensated_anarchist')!.costNumeric).toBe(5e11);
    expect(priced.find((m) => m.entityId === 'former_child_actor')!.costNumeric).toBe(1e12);
  });
});

describe('a gloss that lands after its claim', () => {
  const oversight = (floor: number) =>
    horizonAt(bundle, floor).factsFor('syndicate').find((f) => f.id === 'f017');

  it('is not visible at all before the claim is revealed', () => {
    expect(oversight(0)).toBeUndefined();
  });

  it('shows the claim without its reading at floor 1', () => {
    const fact = oversight(1);
    expect(fact).toBeDefined();
    expect(fact!.predicate).toBe('licenses');
    expect(fact!.gloss).toBeNull();
  });

  it('still withholds the reading at floor 2', () => {
    expect(oversight(2)!.gloss).toBeNull();
  });

  it('shows the reading once the horizon reaches it', () => {
    expect(oversight(3)!.gloss).toContain('remote bureaucracy');
  });
});
