"""Table definitions for the curated corpus.

The shape of every table lives here as data, so the validator stays generic and
adding a column is a one-line change rather than a new code path.
"""

from __future__ import annotations

from dataclasses import dataclass, field

ENTITY_TYPES = (
    "character",
    "faction",
    "class",
    "skill",
    "item",
    "title",
    "location",
    "monster",
)
CONFIDENCE = ("certain", "probable", "inferred")
STATUS = ("active", "departed", "unknown")
EDGE_TYPES = ("allied", "hostile", "kin", "sponsor", "subordinate", "party")
COST_TYPES = (
    "gold",
    "slot",
    "cooldown",
    "health",
    "stamina",
    "mana",
    "sacrifice",
    "none",
)
EFFECT_CATEGORIES = (
    "damage",
    "defense",
    "mobility",
    "utility",
    "economy",
    "social",
    "information",
)

#: Entity types that may carry a `mechanics` row. A location has no price.
PRICEABLE_TYPES = ("class", "skill", "item")


@dataclass(frozen=True)
class Column:
    name: str
    kind: str = "str"  # str | int | floor | enum | ref
    required: bool = True
    values: tuple[str, ...] = ()
    #: For kind="ref": the table whose `id` column this must resolve against.
    ref: str = ""


@dataclass(frozen=True)
class Table:
    name: str
    columns: tuple[Column, ...]
    #: Columns whose combined value must be unique across the table.
    unique: tuple[str, ...] = field(default=())


TABLES: dict[str, Table] = {
    "entities": Table(
        "entities",
        (
            Column("id"),
            Column("type", kind="enum", values=ENTITY_TYPES),
            Column("canonical_name"),
            Column("introduced_floor", kind="floor"),
            Column("notes", required=False),
        ),
        unique=("id",),
    ),
    "aliases": Table(
        "aliases",
        (
            Column("entity_id", kind="ref", ref="entities"),
            Column("alias"),
            Column("reveal_floor", kind="floor"),
        ),
        unique=("entity_id", "alias"),
    ),
    "facts": Table(
        "facts",
        (
            Column("id"),
            Column("subject_id", kind="ref", ref="entities"),
            Column("predicate"),
            Column("object"),
            Column("event_floor", kind="floor"),
            Column("reveal_floor", kind="floor"),
            Column("significance_floor", kind="floor"),
            Column("source"),
            Column("confidence", kind="enum", values=CONFIDENCE),
            Column("notes", required=False),
        ),
        unique=("id",),
    ),
    "status": Table(
        "status",
        (
            Column("entity_id", kind="ref", ref="entities"),
            Column("status", kind="enum", values=STATUS),
            Column("event_floor", kind="floor"),
            Column("reveal_floor", kind="floor"),
        ),
        unique=("entity_id", "status"),
    ),
    "edges": Table(
        "edges",
        (
            Column("src", kind="ref", ref="entities"),
            Column("dst", kind="ref", ref="entities"),
            Column("type", kind="enum", values=EDGE_TYPES),
            Column("event_floor", kind="floor"),
            Column("reveal_floor", kind="floor"),
            Column("ended_event_floor", kind="floor", required=False),
            Column("ended_reveal_floor", kind="floor", required=False),
            Column("confidence", kind="enum", values=CONFIDENCE),
        ),
        unique=("src", "dst", "type", "event_floor"),
    ),
    "mechanics": Table(
        "mechanics",
        (
            Column("entity_id", kind="ref", ref="entities"),
            Column("cost_type", kind="enum", values=COST_TYPES),
            Column("cost_value", required=False),
            Column("effect_category", kind="enum", values=EFFECT_CATEGORIES),
            Column("effect_scale", kind="int"),
            Column("duration", required=False),
            Column("restrictions", required=False),
            Column("introduced_floor", kind="floor"),
            Column("source"),
            Column("confidence", kind="enum", values=CONFIDENCE),
        ),
        unique=("entity_id",),
    ),
}

TABLE_ORDER = ("entities", "aliases", "facts", "status", "edges", "mechanics")
