/**
 * The README quotes corpus counts, and they drift every time the data grows.
 *
 * This is not a leakage test; it is here because the same discipline applies.
 * A number in the docs that no longer matches the bundle is a small lie, and
 * the whole project rests on the claim that what it says about its data is
 * true.
 */
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadBundle } from '@dcc/core';
import { unwrap } from '../../packages/core/src/bundle';

const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
const raw = unwrap(loadBundle());

const claims: [string, number][] = [
  ['entities', raw.entities.length],
  ['facts', raw.facts.length],
  ['relationships', raw.edges.length],
  ['priced records', raw.mechanics.length],
  ['recorded\nholdings', raw.holdings.length],
];

it.each(claims)('the README count of %s matches the bundle', (label, actual) => {
  const found = readme.match(new RegExp(String.raw`(\d[\d,]*)\s+${label}`));
  expect(found, `README does not state a count of ${label}`).not.toBeNull();
  expect(Number(found![1]!.replace(/,/g, ''))).toBe(actual);
});
