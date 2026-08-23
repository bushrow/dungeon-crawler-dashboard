# Corpus schema

Six flat tables, hand-authored as CSV in `data/curated/`, compiled to a single
versioned JSON bundle in `data/dist/`. CSV because the data is the deliverable
and CSV diffs legibly in review.

The apps never read this directory. They read the compiled bundle, and only
through the horizon access layer in `packages/core`.

## Floors

A **floor** is an integer. `0` means the prologue, before the dungeon opens.
Floors `1` through `6` are the dungeon floors covered by the v1 corpus (books 1
and 2, through the Iron Tangle).

A **horizon** is a floor. It is the only filter parameter in the system.

## The three clocks

Every dated column runs on exactly one of three clocks. Conflating them is the
main way spoilers leak, so each column below names its clock.

| Clock | Meaning | Used for |
|---|---|---|
| **event** | when it happened in-world | display and ordering only |
| **reveal** | earliest floor a reader could know the claim | **all filtering** |
| **significance** | earliest floor a reader could know what the claim *meant* | gating interpretive text |

An alliance formed on floor 3 but disclosed in a floor 7 flashback has
`event_floor: 3` and `reveal_floor: 7`. A reader at floor 5 must not see it,
including as a graph edge, a table row, or a denominator in an aggregate.

### The invariant

> For any horizon `f`, no record reachable through the access layer has
> `reveal_floor > f`, and no interpretive text attached to a record has
> `significance_floor > f`.

Enforced once, in `packages/core`, and tested in `tests/leakage/`.

### Rules the validator enforces

1. `significance_floor >= reveal_floor` on every row that has both. Knowing what
   a fact meant before knowing the fact is incoherent.
2. `event_floor > reveal_floor` is **legal**. Prophecy, foreshadowing, and
   announced-but-not-yet-run events genuinely work this way. The validator warns
   and requires a non-empty `notes` value, so it cannot happen by typo.
3. `ended_reveal_floor >= reveal_floor` on edges. A relationship cannot be known
   to have ended before it is known to have existed.
4. Every foreign key resolves. Every enum value is in range. Every row has a
   `source` and a `confidence` where the table defines them.

## Tables

### `entities.csv`

`id · type · canonical_name · introduced_floor · notes`

- `type` is one of `character`, `faction`, `class`, `skill`, `item`, `title`,
  `location`, `monster`.
- **`introduced_floor` runs on the reveal clock.** It is the floor at which a
  reader first meets the entity, not an in-world date. The source spec left this
  implicit, and it is the easiest place in the schema to leak quietly: an entity
  first named in a floor 6 flashback about floor 2 has `introduced_floor: 6`.
- `canonical_name` is the name a reader would use at the entity's introduction.
  Later names and titles go in `aliases.csv` with their own reveal floors.

### `aliases.csv`

`entity_id · alias · reveal_floor`

Titles and epithets are aliases carrying their own reveal positions. This series
generates a lot of them and they leak often, because a title usually encodes the
event that earned it.

### `facts.csv`

`id · subject_id · predicate · object · event_floor · reveal_floor · significance_floor · source · confidence · notes`

Atomic claims. `predicate` is a short verb-ish slug (`sponsored_by`,
`wields`, `member_of`). `object` is a free string or an entity id.

**`notes` is the gloss**, meaning the interpretive text the apps display as
annotation. It is gated by `significance_floor`, not by `reveal_floor`. A fact
can be visible while its gloss is still withheld. When `significance_floor`
equals `reveal_floor` there is nothing withheld.

`confidence` is one of `certain`, `probable`, `inferred`, and describes the
annotation, not the story. `inferred` rows are excluded from headline numbers
and counted in the Ledger's coverage panel.

### `status.csv`

`entity_id · status · event_floor · reveal_floor`

`status` is one of `active`, `departed`, `unknown`. Deliberately euphemistic.
Mortality is the highest-value spoiler in this series, so it gets its own table,
its own code path, and its own tests.

**Absence of a status row is not evidence of activity.** The access layer must
not infer one, and the apps must render nothing at all for an entity with no
visible status row. Rendering "unknown" as a distinct state tells the reader
that something is coming, which is the leak this table exists to prevent.

### `edges.csv`

`src · dst · type · event_floor · reveal_floor · ended_event_floor · ended_reveal_floor · confidence`

`type` is one of `allied`, `hostile`, `kin`, `sponsor`, `subordinate`, `party`.

Both formation and dissolution carry two clocks. The end columns are empty for
an edge that has not ended. An edge is visible at horizon `f` iff
`reveal_floor <= f` and not (`ended_reveal_floor <= f`).

### `mechanics.csv`

`entity_id · cost_type · cost_value · effect_category · effect_scale · duration · restrictions · introduced_floor · source · confidence`

The Ledger's table. One row per class, skill, or item with a priceable effect.

- `cost_type` is one of `gold`, `slot`, `cooldown`, `health`, `stamina`,
  `mana`, `sacrifice`, `none`.
- `effect_category` is one of `damage`, `defense`, `mobility`, `utility`,
  `economy`, `social`, `information`.
- `effect_scale` is an integer 1 through 5.

**`effect_scale` has no rubric behind it in v1.** It is a drafted estimate. It
is comparable *within* an `effect_category` and not across categories, which is
why the Ledger scatter is faceted by category and makes no cross-category claim.
See `docs/LIMITATIONS.md`.

- `introduced_floor` runs on the reveal clock, same as `entities.csv`.

## Provenance

Every row carries `source`. Values are references only: chapter or floor
markers, wiki page ids, `author-interview`, or `inferred`. Never quoted text.

No book text lives in this repo, including in `data/raw/`. No System
notification or achievement text verbatim, anywhere. The humor in this series
lives in the exact wording, which is exactly why it stays out.
