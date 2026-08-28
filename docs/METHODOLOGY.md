# Methodology

## The question both views answer

What does the System look like from inside, at floor N? The Atlas answers it
relationally, the Ledger quantitatively. Neither may show a reader anything they
could not know at the floor they have read to.

## Horizon

A horizon is an integer floor, and it is the only filter parameter in the
system. It lives in the query string, so a floor is linkable, and is mirrored to
`localStorage` so it survives moving between views.

Every dated column runs on one of three clocks, set out in `data/SCHEMA.md`:
the **event** clock for when something happened in-world, the **reveal** clock
for the earliest floor a reader could know it, and the **significance** clock
for the earliest floor a reader could know what it meant. Filtering runs on the
reveal clock alone. Interpretive text runs on the significance clock.

## Where the invariant is enforced

Once, in `packages/core`, and nowhere else.

`Bundle` is an opaque branded type. An app can hold one and pass it to
`horizonAt`, and the type system gives it no way to reach a row. Both views
import `Horizon` and nothing else, so spoiler safety is a property of the
package rather than a rule each view has to remember.

Gloss gating is structural rather than a flag. `factsFor` returns objects whose
`gloss` is `null` when the horizon has not reached the significance floor, so
the withheld string is not in the object at all and no caller can render it by
forgetting a check.

Two omissions are deliberate:

- **Status absence means nothing.** `statusFor` returns `undefined` when no
  status row is visible, and the Atlas draws nothing at all in that case. An
  "unknown" badge would tell a reader that something about that character is
  being withheld, which is the spoiler the table exists to prevent.
- **Coverage counts no withheld records.** Reporting "four facts have a gloss
  you cannot see yet" leaks the existence of the withheld material. The coverage
  panel counts only what is visible.

## Relationships

Edges for floors 4 and up are derived from wiki fields that carry a citation,
and only those. An undated ally list is current as of book 8, so dating it at a
character's introduction would reveal an alliance several books early.

Where a field has several citations the latest dates the edge, because the
citations cover the whole field and the last one is the first floor by which
every name in it is known. Faction membership is cited per sub-group, so a
members list is split on semicolons and each group takes its own date.

## Search

Search is a method on `Horizon`, not code in a view. It is a query over the
corpus like any other, and a query written inside an app is a query nobody
tested for leaks.

It matches visible entities on their name and on aliases that have been
revealed. Both halves matter: finding a character before you meet them tells you
they exist, and finding one by a title they have not earned yet tells you what
happens to them. `tests/leakage/search.test.ts` covers both at every floor.

One subtlety the tests encode: searching a future entity's name can legitimately
return a *visible* entity whose own name contains it. Searching "Grull" on floor
1 finds the Enchanted War Gauntlet of the Exalted Grull, which the reader is
already carrying. What must never come back is the future entity itself.

## Validation

`pipeline/` validates the curated tables before compiling and validates the
assembled bundle before writing it, so a bundle on disk is one that satisfied
every invariant at the moment it was written.

Beyond types, enums, and foreign keys, the validator enforces that **a record
cannot become visible before its subject does**. Every alias, fact, status, and
edge must have `reveal_floor >= introduced_floor` of the entity it hangs off.
Without that rule the access layer filters correctly and the data still leaks: a
reader at floor 2 sees a title attached to somebody they have not met.

A fact's `object` column is free text except when it happens to name an entity.
Then it is a reference, the views resolve it to a display name, and it is held
to the same rule.

## Character sheets

`holdings` and `stats` carry the sheet data, and both run on the same reveal
clock as everything else, so they inherit the leakage suite without new
machinery. A holding is visible on exactly the terms an edge is: revealed by
now, and not already known to have ended.

Levels and stats past floor 2 come from the per-book tables on the main
character pages, mapped book 1 to floor 2 and book N to floor N+1 thereafter.
The mapping is checkable: book 1's final line is level 13 at 12/3/14/6/4, which
is exactly what the floor 2 page records independently.

Every stat field but the floor is optional, because the source carries a level
for almost every book and a full attribute line for only a few. A sheet renders
the attribute grid only when it has attributes, rather than five nulls.

`statsFor` returns the most recent line at or before the horizon rather than
requiring one per floor, and `sheetFor` reports the floor it came from. Showing
the last known line and naming its floor is honest; inventing a current one is
not, and showing nothing throws away what the reader does know.

Confidence never reaches either app. It describes the annotation rather than the
subject, so it is a review field, read in `docs/CORPUS-REVIEW.md`. Rows too weak
to show are left out rather than displayed with a warning attached.

## Layout

The graph layout is computed once, at compile time, over the whole corpus, and
frozen into the bundle. It covers only characters and factions that have a
relationship somewhere in the corpus: placing isolated nodes would scatter dots
across the canvas and stretch the layout away from the graph that exists. The
box grows with the node count, since the minimum gap between nodes is fixed and
a fixed box stops being satisfiable. The Atlas prints how many entities it is
leaving out. The views render only the horizon-visible subgraph at
those fixed coordinates. Nodes past the horizon are absent from the DOM rather
than hidden with CSS.

Recomputing per floor would make the graph jump on every scrub tick and destroy
the sense of watching one thing evolve. Computing it in the pipeline also keeps
the apps free of any runtime dependency and puts the coordinates in git, where a
layout change shows up as a real diff.

Fruchterman-Reingold is implemented in plain Python rather than taken from
networkx, so the result is identical on every machine. The first version used
networkx, and coordinates diverged by up to 150 units between arm64 and x64: a
spring layout is chaotic, so the floating-point difference between two numpy
builds amplifies from 1e-15 into a visibly different graph, and CI could not
tell that apart from stale data. Fixed iteration order over IEEE doubles removes
the problem, and it leaves the pipeline with no dependencies at all.

## Tests

`pipeline/tests/` covers the validators, including tables that must fail.

`tests/leakage/` runs against `packages/core`, so both views inherit it:

1. **Property test.** Every floor, every access method, nothing returned with a
   reveal floor past the horizon and no gloss past its significance floor.
2. **Golden fixtures** at floors 0, 1, and 3, which prove the right records are
   present. A filter that returned nothing would pass the property test.
3. **Matched-pair refusal.** Entities identical in everything visible, differing
   only in whether something happens to one of them later, must be
   indistinguishable. This catches the failure where refusing to answer is the
   answer.
4. **Aggregate leakage.** Counts, denominators, and axis ranges computed over
   the filtered set.

## Provenance and posture

Source pages come from the community wiki, pulled with
`pipeline/scripts/fetch_wiki.py` through the MediaWiki API into `data/raw/wiki/`.
That directory is gitignored, so the wiki's own prose stays out of the repo and
off the published site. What ships is structured fields plus a reference, and
`docs/CORPUS-REVIEW.md` lists every row with a link back to the page it came
from so a reader can check the work.

Floor assignment uses the wiki's first-appearance chapter, mapped as: book 1
chapters 1 to 2 are before the dungeon, 3 to 40 are floor 1, and the rest of
book 1 is floor 2; book 2 is floor 3. Where that disagrees with the wiki's own
per-floor category, the later floor wins, so a record appears too late rather
than too early.

Every row carries a `source`, and values are references only: chapter or floor
markers, wiki page ids, or `inferred`. Every row carries a `confidence` of
`certain`, `probable`, or `inferred`, describing the annotation rather than the
story. Inferred rows are excluded from headline numbers and counted in the
Ledger's coverage panel.

No book text lives in this repo, including in `data/raw/`, which is gitignored.
No System notification or achievement text verbatim, anywhere. The humour in the
series lives in the exact wording, which is exactly why it stays out.

This is an unofficial fan project. Go buy the books.
