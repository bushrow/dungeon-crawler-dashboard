# Limitations

Read this before quoting a number off the Ledger.

## The corpus is drafted from recall, then reviewed

The v1 corpus was written from memory of books 1 and 2 and then corrected, not
sourced line by line against the text. Every row carries a `confidence` of
`certain`, `probable`, or `inferred`. Rows marked `inferred` are excluded from
headline numbers and counted separately in the coverage panel.

The mechanics table is the weakest part of the corpus and the one the Ledger
rests on entirely. Treat its `effect_scale` values as a first pass.

## `effect_scale` has no rubric behind it

The scores are estimates, made without a written rubric and without a second
pass. Two consequences:

- They are comparable **within** an `effect_category` and not across categories.
  The Ledger draws one small multiple per category and makes no cross-category
  claim, which is the most conservative of the three options in the project
  spec.
- No claim about which abilities are underpriced is available yet. That needs a
  committed rubric, a preregistered definition of "underpriced", and a
  confusion matrix against narrative labels. All deferred; see below.

## Nothing has a cost that is a number

Cost is recorded as a type (`gold`, `slot`, `cooldown`, and so on) and a free
text amount, and in the v1 corpus every amount is either absent or a word like
"unknown". Zero of the priced records have a numeric cost.

So there is no cost axis. The chart plots effect scale against the *kind* of
cost, which is what the data supports. A cost-versus-effect scatter needs prices
that are figures, and those are a corpus problem rather than a rendering one.

## The frozen layout leaves gaps

Graph coordinates are computed once over the whole corpus and frozen, so nodes
fade in where they were always going to be and nothing else moves when the
horizon does. The cost is visible empty space where future nodes will appear.

This does not leak how many are coming or who they are, since positions are not
rendered until the node is. It does mean the graph looks sparser at floor 1 than
a per-floor layout would.

## Scope is floors 0 through 3

Books 1 and 2, ending with the Over City. Book 1 covers floors 1 and 2; book 2
is floor 3. Everything past that is absent, not withheld.

## Entity types are approximate in two places

The schema has no species type, so the Bopca are recorded as a faction. It has
no romantic-relationship edge type, so a former partnership is recorded as
`kin`. Both are noted in the rows themselves.

## Absence is not evidence

An entity with no visible status row renders no status at all. That is
deliberate, and it means you cannot read "no status shown" as "alive". It might
equally mean nobody has written the row yet. The two cases are indistinguishable
on purpose, and there is a test asserting they stay that way.

## Deferred

The preregistration, the scoring rubric, the cost-to-effect regression, and the
confusion matrix against narrative labels are not built. They are the part that
would turn the Ledger from a chart into a finding, and they are worth doing once
the corpus is real and reviewed. Committing a definition of "underpriced" before
there is data to score it against would be preregistration in form only.
