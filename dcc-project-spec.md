# DCC Project — Double Spec

Two applications, one corpus, one repo.

- **Atlas** — a floor-scrubbable relationship graph. Relational view.
- **Ledger** — a balance audit of the System's game design. Quantitative view.

Both answer the same question in different registers: *what does the System look like from inside, at floor N?*

---

## 1. The organizing decision

**The corpus is the product. The apps are views.**

The expensive, differentiating asset here is an annotated dataset where every claim carries the floor at which a reader could know it. Both apps are thin readers over that dataset. This ordering has consequences worth committing to up front:

- The data layer versions and ships independently of either app.
- Neither app owns schema. Schema changes are a data-layer concern with its own review bar.
- If both apps are abandoned, the published dataset and its validation suite remain a real artifact.
- A third consumer (the spoiler companion, an extraction study) costs a fraction of the first two.

**Non-goal:** a general "DCC wiki." Scope is bounded by what the two apps need, plus whatever the horizon invariant requires.

---

## 2. The shared primitive: horizon

A **horizon** is an integer floor. It is the single parameter both apps take, and the single axis all filtering runs on.

### The two-clock problem

Every fact has two positions, and conflating them is the most likely source of silent leakage:

| Clock | Meaning | Used for |
|---|---|---|
| `event_floor` | when it happened in-world | display, ordering, narrative |
| `reveal_floor` | earliest floor a reader could know it | **all filtering** |

An alliance formed on floor 3 but disclosed in a floor 7 flashback has `event_floor: 3`, `reveal_floor: 7`. A reader at floor 5 must not see it — including as a graph edge, including as a row in a table, including as a denominator in an aggregate.

A third position applies to facts whose meaning changes later:

- `significance_floor` — when the reader learns what the fact *meant*. The claim is safe at `reveal_floor`; the gloss on it is not safe until `significance_floor`. Annotations, tooltips, and any editorializing copy filter on this, not on `reveal_floor`.

### The invariant

> For any horizon `f`, no record reachable through the data-access layer has `reveal_floor > f`, and no interpretive text attached to a record has `significance_floor > f`.

This is enforced **once**, at the access layer, not per-app. Apps cannot query raw data. This is the single most important structural decision in the repo — it makes spoiler safety a property of the system rather than a feature of each view.

---

## 3. Data model

Flat tables, authored as CSV or JSONL, compiled to versioned JSON bundles.

### `entities`
`id · type · canonical_name · introduced_floor · notes`

`type ∈ {character, faction, class, skill, item, title, location, monster}`

### `aliases`
`entity_id · alias · reveal_floor`

Titles and epithets are aliases with their own reveal positions. This series generates a large number of them and they are a common leakage vector — a title often encodes the event that earned it.

### `facts`
`id · subject_id · predicate · object · event_floor · reveal_floor · significance_floor · source · confidence · notes`

Atomic claims. `confidence ∈ {certain, probable, inferred}` — your annotation confidence, not the story's.

### `status`
`entity_id · status · event_floor · reveal_floor`

`status ∈ {active, departed, unknown}` — deliberately euphemistic. Mortality is the highest-value spoiler in this series and gets a dedicated table, a dedicated code path, and dedicated tests. Absence of a status row is *not* evidence of activity; the access layer must not infer.

### `edges` (Atlas)
`src · dst · type · event_floor · reveal_floor · ended_event_floor · ended_reveal_floor · confidence`

`type ∈ {allied, hostile, kin, sponsor, subordinate, party}`

Both formation and dissolution carry two clocks. An edge is rendered at horizon `f` iff `reveal_floor ≤ f` and not (`ended_reveal_floor ≤ f`).

### `mechanics` (Ledger)
`entity_id · cost_type · cost_value · effect_category · effect_scale · duration · restrictions · introduced_floor · source · confidence`

`effect_scale` is the hard part — see §5.2.

### Provenance
Every row carries `source`. Values are references (chapter or floor markers, wiki page IDs, "author interview", "inferred"), never quoted text. Rows sourced by inference are flagged and excluded from headline numbers.

---

## 4. Repo layout

```
dcc/
├── data/
│   ├── raw/              # scrape dumps, gitignored
│   ├── curated/          # hand-authored tables — the asset
│   ├── dist/             # compiled, versioned JSON bundles
│   └── SCHEMA.md
├── pipeline/             # Python: extract, normalize, validate, compile
│   ├── extract/
│   ├── validate/         # schema + invariant checks
│   └── compile/          # curated → dist bundles
├── packages/
│   └── core/             # TS: types, loaders, horizon-filtered access layer
├── apps/
│   ├── atlas/
│   └── ledger/
├── analysis/
│   ├── preregistration.md   # committed before narrative join
│   └── notebooks/
├── docs/
│   ├── METHODOLOGY.md
│   └── LIMITATIONS.md
└── tests/
    └── leakage/          # runs against core, not apps
```

**The contract** between pipeline and apps is the compiled bundle in `data/dist/`, validated on write. Apps never read `curated/`. Bundles are semver'd; apps pin a version.

**Deployment:** one shell at `/dcc/` with two routes, matching your existing `/mcu-timeline/` and `/finance/` pattern. Shared nav, shared floor selector, shared methodology page. The horizon persists across routes — set it once, and both views respect it.

---

## 5. App specs

### 5.1 Atlas — relational view

**Core interaction:** a force-directed network with a floor slider. Nodes are characters and factions; edges are relationships. Scrubbing forward reveals nodes, forms and breaks alliances, reshapes topology.

**Layout continuity.** Recomputing the force layout per floor makes the graph jump on every scrub tick and destroys the sense of watching one thing evolve. Instead: compute one layout over the full graph, freeze coordinates, render only the horizon-visible subgraph. Nodes fade in at their positions. Continuity is free, and hidden nodes are never in the DOM.

*Known minor artifact:* frozen layout leaves visible gaps where future nodes will appear. Note it in `LIMITATIONS.md`; the alternative is worse.

**Node card.** Clicking a node opens a card scoped to the horizon: aliases known by now, relationships visible by now, facts revealed by now. This is the spoiler companion in miniature — same filtering, no free-text query. If you later build the full companion, this card is its answer surface.

**Status rendering.** The card shows `active` and `departed` when revealed. It does *not* render "unknown" as a distinct visual state — a node styled differently because you're missing data is an information leak about which characters have something coming.

**Deliberately out of scope:** free-text search, pathfinding, timeline animation with playback, edge weights.

### 5.2 Ledger — quantitative view

**Thesis under test:** the System is priced for spectacle, not for balance. Abilities that are broken as game design are exactly the ones that generate interesting outcomes for viewers.

**The commensurability problem.** `effect_scale` across incomparable effect types is the weakest link in the whole project. Options, in descending order of rigor and ascending order of feasibility:

1. Rank within `effect_category` only; never compare across categories. Cleanest, least interesting.
2. Hand-score utility 1–5 against a written rubric, blind to narrative outcome, two passes separated by at least a week, report intra-rater agreement.
3. LLM-scored against the same rubric, spot-checked by hand, report agreement rate with your own scores.

Recommend (2) with (3) as a cross-check — and report the disagreement rate as a finding rather than hiding it. Whatever you choose, the rubric is written and committed before any scoring.

**The falsifiable claim.** In `analysis/preregistration.md`, committed and timestamped *before* joining any narrative labels:

- the exact definition of "underpriced" (e.g. residual from a `cost ~ effect_scale` fit exceeding *k* standard deviations, with *k* fixed in advance)
- the scoring rubric
- the exclusion criteria
- the list of flagged entities the procedure produces

Then, and only then, join the narrative labels — which abilities the story actually treats as broken — and report the confusion matrix. **This is the part that makes it science.** A wrong prediction, reported honestly, is a better artifact than a right one arrived at by fiddling.

**Views:**
- Cost vs. effect scatter, with flagged outliers, filtered to horizon
- Reward-to-difficulty curve by floor
- Class viability comparison
- Coverage panel: entities scored, entities excluded, annotation confidence distribution

**Coverage is a first-class display, not a footnote.** Showing what you *couldn't* measure, adjacent to what you could, is the single cheapest signal that you know the difference between a chart and a finding.

---

## 6. Test strategy

Leakage tests run against `packages/core`, so both apps inherit them.

1. **Property test.** For all floors 1..N and all access-layer methods, assert no returned record has `reveal_floor > f` or attached interpretation with `significance_floor > f`. Generative, cheap, catches most regressions.
2. **Golden fixtures.** Hand-built expected outputs at a handful of horizons, including boundary floors where major reveals cluster.
3. **Matched-pair refusal tests.** For status queries specifically: pairs of entities identical in visible respects, differing in whether a future status change exists. Assert responses are indistinguishable. This is the test that catches negative-space leakage — the failure where refusing to answer *is* the answer.
4. **Aggregate leakage.** Assert that counts, denominators, and axis ranges are computed over the filtered set. A y-axis scaled to include future data leaks.

---

## 7. IP and posture

- Narrative annotations sourced from your own reading notes and the community wiki. No book text in the repo, including in `data/raw/`.
- Published fields are structured facts, paraphrase, and numbers. **No System notification or achievement text, verbatim, anywhere.** The humor lives in the exact wording, which is precisely why it stays out.
- Label as an unofficial fan project prominently, with a link to the books.
- Recommend this repo be public. Your other two projects list source as private, which leaves an external reader nothing to evaluate your standards by — and this is the one with a test suite worth showing.

---

## 8. Milestones

| | Deliverable | Standalone value if abandoned here |
|---|---|---|
| M0 | `SCHEMA.md` + validator + 20 hand-authored rows | Schema design as a writing artifact |
| M1 | Curated corpus through a fixed early floor | The dataset |
| M2 | `packages/core` + leakage suite green | Reusable, testable access layer |
| M3 | Atlas MVP: scrubber, frozen layout, node cards | A shippable, shareable tool |
| M4 | `preregistration.md` committed | A falsifiable claim on the record |
| M5 | Ledger: scoring, analysis, confusion matrix | The result, whichever way it goes |
| M6 | `METHODOLOGY.md`, `LIMITATIONS.md`, essay integration | The writeup |

M4 before M5 is not a formality. Committing the definition of "underpriced" before you can see whether it flags the right things is the whole reason the result will be worth reading.
