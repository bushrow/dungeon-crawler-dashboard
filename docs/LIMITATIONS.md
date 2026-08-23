# Limitations

Read this before quoting a number off the Ledger.

## The corpus is sourced from a fan wiki, not from the text

Rows are built from the community wiki at dungeon-crawler-carl.fandom.com, with
the page recorded in each row's `source` and linked from
`docs/CORPUS-REVIEW.md`. That is a secondary source maintained by readers: it is
far better than recall, and it is not the books. Where the wiki hedges, the row
is marked `inferred` and says so in `restrictions`.

Every row carries a `confidence` of `certain`, `probable`, or `inferred`. Rows
marked `inferred` are excluded from headline numbers and counted separately in
the coverage panel.

Floor assignment is the shakiest structural field. The wiki gives a first
appearance as a book and chapter, and its own per-floor categories sometimes
disagree with that chapter. Where they conflict the later floor wins, so a
record appears too late rather than too early.

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

## Almost nothing has a cost that is a number

Cost is recorded as a type (`gold`, `views`, `skill`, and so on) and an amount.
Four of 66 rows carry a figure: Compensated Anarchist is gated at 500 billion
views, Former Child Actor at one trillion, Prizefighter at Pugilism level 5, and
Goblin Dynamite sells at 20 gold a stick. Everything else records a kind of cost
with no amount, because the source states the gate without stating a price. Of
eighteen item pages checked, exactly one listed a price.

Those three figures are not on one scale. Views and skill levels are different
units, so `cost_numeric` is comparable only within a `cost_type`, the same
restriction `effect_scale` has within a category.

So the chart plots effect scale against the *kind* of cost. A cost-versus-effect
scatter needs prices that are figures across the table, and that is a corpus
problem rather than a rendering one. The coverage panel reports how many rows
carry one.

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

The wiki records series-current status for every character, most of it cited to
books 3 through 8. None of that is in the corpus. Status rows cover only what
books 1 and 2 establish, which is why every one of them reads `active`.

## Most facts are transcribed fields, not written claims

Ninety-two of the 163 facts were generated straight from the wiki's own infobox
fields, mapped one field to one predicate: `effect` becomes "does", `penalties`
becomes "has weakness", and so on. That keeps my judgment out of them and makes
them easy to check against the page, but it also means they read like a
datasheet rather than like claims, and they inherit whatever the infobox got
wrong. They are marked `certain` because the transcription is faithful, which is
a statement about the copying rather than about the books.

## Entity types are approximate in three places

The schema has no species type, so the Bopca appear both as a faction and as a
race. It has no romantic-relationship edge type, so Carl and Beatrice are
recorded as `kin`. It has no spell type, so spells are recorded as skills with a
note. All three are visible in the rows themselves.

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
