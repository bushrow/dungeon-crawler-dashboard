/**
 * The only way into the corpus.
 *
 * Apps import `loadBundle` and `horizonAt` and nothing else. `Bundle` is opaque,
 * so there is no supported path from an app to an unfiltered row, and the
 * leakage suite in tests/leakage runs against this package rather than against
 * either view.
 */
export { loadBundle, maxFloorOf, versionOf } from './bundle';
export type { Bundle } from './bundle';
export { Horizon, horizonAt } from './horizon';
export type * from './types';
