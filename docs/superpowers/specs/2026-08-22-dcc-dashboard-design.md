# DCC Dashboard design

2026-08-22

Two views over one annotated corpus, per `dcc-project-spec.md`. This document
records what the build decided where the source spec left a choice open, and why.

## What is being built

- **Atlas**, the floor map: a floor-scrubbable graph of characters and factions.
  Scrubbing forward reveals nodes and forms or breaks alliances.
- **Ledger**, the stats sheet: the cost and value of every class and major item,
  as a sortable table plus a cost-vs-effect scatter.

Both take one parameter, a horizon, and neither may show a reader anything they
could not know at that floor. The corpus is the product; the apps read it.

## Decisions

**Full monorepo, Python pipeline.** Authoring, validation, layout, and compile
live in `pipeline/`. The apps read only `data/dist/dcc-bundle.json`. The contract
between them is that bundle, validated on write.

**One Vite build, two entries.** `apps/atlas` and `apps/ledger` stay separate
sources with their own entry HTML, built by one Vite config with two rollup
inputs. They share `apps/shell` and `packages/core` by import. One dist, one
deploy, one dev server, and no duplicated build config. The alternative, two
independent builds stitched at deploy, buys a boundary that nothing needs yet.

**Layout computed at compile time.** The Python compile step runs one seeded
spring layout over the *full* graph and writes frozen x/y coordinates into the
bundle. Three things follow: the apps keep zero runtime dependencies, layout is
deterministic and reviewable in git, and no simulation code ships to the browser.
The force layout is implemented in plain Python rather than taken from networkx,
because a spring layout amplifies the floating-point difference between numpy on
arm64 and on x64 into a visibly different graph.
Nodes fade in at fixed positions when the horizon reaches them, so scrubbing
reads as one graph evolving rather than a new graph each tick.

The known cost is visible gaps where future nodes will appear. Recorded in
`LIMITATIONS.md`. The alternative, relaxing the layout per floor, makes the graph
jump on every tick and destroys the thing the view is for.

**Corpus scope is floors 0 through 3**, books 1 and 2, ending with the Over City.
Book 1 covers floors 1 and 2; book 2 is floor 3. Small enough to author carefully
and review in one sitting, and it extends one floor at a time afterwards.

**Ledger v1 is descriptive.** Table, faceted scatter, coverage panel. The
preregistration, the scoring rubric, the cost-to-effect regression, and the
confusion matrix against narrative labels are deferred until the corpus is real
and reviewed. Committing a definition of "underpriced" before there is data to
score would be preregistration in form only.

Because `effect_scale` has no rubric behind it in v1, the scatter is faceted by
`effect_category` and makes no cross-category comparison. That is option (1) in
the source spec's §5.2: rank within category, never across.

## Schema ambiguities resolved

The source spec left two things implicit that the validator now enforces. Both
are written up in `data/SCHEMA.md`.

**`introduced_floor` runs on the reveal clock.** It is the floor at which a
reader first meets an entity, not an in-world date. Read the other way, every
entity introduced in a flashback becomes visible too early, and it leaks silently
because the graph still looks correct.

**`event_floor > reveal_floor` stays legal.** Prophecy and foreshadowing really
do work that way. The validator warns and requires a `notes` value, so it cannot
happen by typo. `significance_floor >= reveal_floor` is enforced outright.

## Structure

```
data/curated/*.csv   ->  pipeline/  ->  data/dist/dcc-bundle.json
                                              |
                                        packages/core        (horizon filter, the only row access)
                                              |
                                  apps/shell + atlas + ledger
```

`Bundle` is exported as an opaque branded type. Apps import `Horizon` and cannot
reach raw rows even by accident.

## Testing

Python: pytest over the validators, including fixtures that should fail.

TypeScript, in `tests/leakage/`, running against `packages/core` so both apps
inherit them:

1. **Property test.** Every floor, every access method, nothing returned with
   `reveal_floor > f` and no gloss with `significance_floor > f`.
2. **Golden fixtures** at floors 0, 1, and 3.
3. **Matched-pair refusal.** Entities identical in everything visible, differing
   only in whether a future status change exists, must be indistinguishable. This
   catches the failure where refusing to answer is itself the answer.
4. **Aggregate leakage.** Counts, denominators, and axis ranges computed over the
   filtered set. A y-axis scaled to fit future data leaks.

Steps 5 through 7 of the build order are gated on this suite passing. Neither app
is built against unfiltered data at any point.

## Data accuracy

The v1 corpus is drafted from recall and then reviewed, not sourced line by line.
Every row carries `confidence` of `certain`, `probable`, or `inferred`. Inferred
rows are excluded from headline numbers and counted in the coverage panel, so
weak data stays visible rather than blending into the totals. Stated plainly in
`docs/LIMITATIONS.md`.

## Changed from the original spec

**Free-text search is now in.** The source spec ruled it out, and that was right
when the corpus was hypothetical and twenty rows. At 444 entities across nine
floors, 326 of which have no relationship and no price, browsing without search
is not usable, and those records had no way to be seen at all. Search lives in
the access layer with its own leakage tests rather than in a view.

**There are three views, not two.** Browse is the front door; Atlas and Ledger
are lenses on the same corpus.

## Out of scope

Pathfinding, playback animation, and edge weights in Atlas.
Corpus past floor 3. The full spoiler companion. The `analysis/` tree.
