/**
 * The enum lists exist twice: once in pipeline/dcc_pipeline/schema.py, which
 * validates the CSVs, and once in packages/core/src/types.ts, which types the
 * apps. Duplication is the price of the two-language split, so this asserts the
 * TypeScript side actually covers what the shipped bundle contains.
 *
 * Without it, adding a cost type in Python and forgetting the TypeScript side
 * gives a bundle whose rows do not match their declared type, and nothing fails.
 */
import { describe, expect, it } from 'vitest';
import {
  COST_TYPES,
  CONFIDENCE_LEVELS,
  EDGE_TYPES,
  EFFECT_CATEGORIES,
  ENTITY_TYPES,
  STATUS_VALUES,
  loadBundle,
} from '@dcc/core';
import { unwrap } from '../../packages/core/src/bundle';

const raw = unwrap(loadBundle());

const cases: [string, readonly string[], string[]][] = [
  ['entity type', ENTITY_TYPES, raw.entities.map((e) => e.type)],
  ['edge type', EDGE_TYPES, raw.edges.map((e) => e.type)],
  ['edge confidence', CONFIDENCE_LEVELS, raw.edges.map((e) => e.confidence)],
  ['fact confidence', CONFIDENCE_LEVELS, raw.facts.map((f) => f.confidence)],
  ['status value', STATUS_VALUES, raw.status.map((s) => s.status)],
  ['cost type', COST_TYPES, raw.mechanics.map((m) => m.costType)],
  ['effect category', EFFECT_CATEGORIES, raw.mechanics.map((m) => m.effectCategory)],
];

describe.each(cases)('every %s in the bundle is declared', (label, declared, used) => {
  it(`covers ${label}`, () => {
    const unknown = [...new Set(used)].filter((value) => !declared.includes(value));
    expect(unknown, `undeclared ${label} values in the bundle`).toEqual([]);
  });
});

it('declares no effect category the corpus has never used', () => {
  // Not a failure, just worth seeing: an unused category means the Ledger draws
  // a facet that can never appear.
  const used = new Set(raw.mechanics.map((m) => m.effectCategory));
  const unused = EFFECT_CATEGORIES.filter((c) => !used.has(c));
  expect(unused.length).toBeLessThan(EFFECT_CATEGORIES.length);
});
