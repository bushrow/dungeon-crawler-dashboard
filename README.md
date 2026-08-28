# Dungeon Crawler Carl: Atlas and Ledger

Two views over one annotated corpus, both filtered to the floor you have read to.

- **Atlas** is the floor map: who is connected to whom, at floor N. Scrub the
  embargo bar and nodes fade in where they were always going to be.
- **Ledger** is the character sheets: Carl and Donut, their stats, kit, skills,
  and spells at the floor you have read to. Scrub and the sheet changes with
  them, and it says which floor each part was last recorded on. Behind a second tab, a catalogue of every priced class and item.

Nothing past your floor is rendered, and nothing past your floor is in the DOM.

## Running it

```bash
npm install
npm run dev        # both views, one dev server
npm test           # 214 leakage tests against the access layer
npm run build      # static site into dist/
```

The pipeline is Python, managed with uv:

```bash
npm run data:validate   # check the curated tables
npm run data:test       # 40 pipeline tests
npm run data            # recompile data/dist/dcc-bundle.json
npm run data:verify     # committed bundle still matches the tables
npm run data:review     # regenerate docs/CORPUS-REVIEW.md
```

## How it fits together

```
data/curated/*.csv  ->  pipeline/  ->  data/dist/dcc-bundle.json
                                              |
                                        packages/core          the only row access
                                              |
                                  apps/shell + atlas + ledger
```

The corpus is the product and the views read it. `packages/core` is the only
code that touches a row: it takes a floor and hands back what a reader at that
floor could know. `Bundle` is an opaque type, so the views have no path to
unfiltered data, and the leakage suite runs against the package rather than
against either view.

Spoiler safety is a property of the system, not a feature of each view.

## What is in it

444 entities, 473 facts, 53 relationships, 66 priced records, and 50 recorded
holdings across floors 0 to 9, which is books 1 to 8. Floors 0 to 3 are authored
record by record; floors 4 to 9 carry entities and facts but not yet prices,
relationships, or sheet kit. Every row carries a source and a confidence, and
`docs/CORPUS-REVIEW.md` lists all of them with a link to the page each came
from.

The apps have no runtime dependencies. The whole thing is TypeScript, two
stylesheets, and one compiled JSON bundle.

## Read these before trusting a number

`docs/LIMITATIONS.md` is short and matters. The corpus comes from a community
wiki rather than from the books, `effect_scale` has no rubric behind it, and
only two records carry a cost that is an actual figure.

`docs/METHODOLOGY.md` covers the three clocks, where the invariant is enforced,
and why the coverage panel deliberately does not count what it cannot show.

## Posture

Unofficial fan project. No book text in the repo, and no System notification or
achievement text verbatim, anywhere. Go buy the books.
