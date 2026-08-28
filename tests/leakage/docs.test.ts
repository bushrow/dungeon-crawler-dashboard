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
import { lastBook } from '../../apps/shell/src/index';
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

it('the header states the book range the corpus actually reaches', () => {
  // It said "books 1-2" for several commits after the corpus reached floor 9.
  expect(lastBook(raw.maxFloor)).toBe(8);
  expect(lastBook(3)).toBe(2);
  expect(lastBook(2)).toBe(1);
});

it('keeps every System quote inside the excerpt cap', () => {
  // Bounded quotation is the whole basis on which these are included at all.
  // The cap is a commitment, so it is enforced rather than trusted.
  const CAP = 26;
  const tooLong = raw.entities
    .filter((e) => e.systemQuote)
    .filter((e) => e.systemQuote!.split(/\s+/).length > CAP)
    .map((e) => `${e.canonicalName} (${e.systemQuote!.split(/\s+/).length} words)`);
  expect(tooLong).toEqual([]);
});
