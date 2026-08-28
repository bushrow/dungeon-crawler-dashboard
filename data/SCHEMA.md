# Corpus schema

Six flat tables, hand-authored as CSV in `data/curated/`, compiled to a single
versioned JSON bundle in `data/dist/`. CSV because the data is the deliverable
and CSV diffs legibly in review.

The apps never read this directory. They read the compiled bundle, and only
through the horizon access layer in `packages/core`.

## Floors

A **floor** is an integer. `0` means the prologue, before the dungeon opens.
Floors `1` through `3` are the dungeon floors covered by the v1 corpus: books 1
and 2, ending with the Over City.

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
3. `status` may not be foreshadowed. It carries no `notes` column, so
   `event_floor > reveal_floor` on a status row is an error rather than a
   warning.
4. `ended_reveal_floor >= reveal_floor` on edges. A relationship cannot be known
   to have ended before it is known to have existed. The two `ended_` columns are
   both set or both empty.
5. **A record may not become visible before its subject does.** Every alias,
   fact, status, and edge must have `reveal_floor >= introduced_floor` of the
   entity it hangs off, and a `mechanics` row the same for its
   `introduced_floor`. Without this the access layer filters correctly and the
   data still leaks, because a reader at floor 2 sees a title attached to
   somebody they have not met.
6. Every foreign key resolves. Every enum value is in range. Every row has a
   `source` and a `confidence` where the table defines them. A `mechanics` row
   may only reference a `class`, `skill`, or `item`.

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
annotation, not the story.

**Confidence is a review field and is never shown in either app.** It says
something about my sourcing, not about the dungeon, and a reader cannot act on
it. `inferred` rows are simply left out of the views; `docs/CORPUS-REVIEW.md` is
where confidence is read.

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

### `holdings.csv`

`entity_id · held_id · kind · slot · level · event_floor · reveal_floor · ended_event_floor · ended_reveal_floor · source · confidence`

What a crawler has and knows. `kind` is one of `gear`, `skill`, `spell`,
`class`, `race`. `slot` is the equipment slot for gear and empty otherwise;
`level` is the skill's level where the source records one.

Both clocks again: gear picked up on floor 1 and lost on floor 2 carries an
`ended_reveal_floor` of 2 and leaves the sheet exactly when the reader learns it
is gone. Same rule as `edges.csv`, and the same test covers it.

Only Carl and Donut have rows here. They are the only crawlers with per-floor
pages on the wiki; every other character has a single infobox whose gear and
level are current as of book 8, and reading those would put late-series loadout
on an early-floor sheet.

### `stats.csv`

`entity_id · floor · level · str · int · con · dex · cha · source · confidence`

End-of-floor stat line, one row per crawler per floor. `floor` runs on the
reveal clock. A floor with no row is not an error: the access layer falls back
to the most recent earlier line and reports which floor it came from, so a sheet
says "as of floor 2" rather than inventing a floor 3.

## Provenance

Every row carries `source`. Values are references only: chapter or floor
markers, wiki page ids, `author-interview`, or `inferred`. Never quoted text.

No book text lives in this repo, including in `data/raw/`. No System
notification or achievement text verbatim, anywhere. The humor in this series
lives in the exact wording, which is exactly why it stays out.
