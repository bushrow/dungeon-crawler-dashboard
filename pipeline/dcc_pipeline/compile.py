"""Compile the curated tables into the single bundle the apps read.

This is the contract between the authoring side and the apps. Nothing is written
unless validation passes, so a bundle on disk is a bundle that satisfied every
invariant in data/SCHEMA.md at the moment it was written.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from . import BUNDLE_VERSION, MAX_FLOOR
from .layout import compute as compute_layout
from .validate import errors, read_tables, validate

ROOT = Path(__file__).resolve().parents[2]
DIST = ROOT / "data" / "dist" / "dcc-bundle.json"

#: CSV column -> bundle field. Columns absent here keep their name.
RENAMES = {
    "canonical_name": "canonicalName",
    "introduced_floor": "introducedFloor",
    "entity_id": "entityId",
    "reveal_floor": "revealFloor",
    "subject_id": "subjectId",
    "event_floor": "eventFloor",
    "significance_floor": "significanceFloor",
    "ended_event_floor": "endedEventFloor",
    "ended_reveal_floor": "endedRevealFloor",
    "cost_type": "costType",
    "held_id": "heldId",
    "cost_value": "costValue",
    "effect_category": "effectCategory",
    "effect_scale": "effectScale",
}

#: Fields that are integers in the bundle, or null when the cell is empty.
NUMERIC = {
    "floor",
    "level",
    "str",
    "int",
    "con",
    "dex",
    "cha",
    "introducedFloor",
    "revealFloor",
    "eventFloor",
    "significanceFloor",
    "endedEventFloor",
    "endedRevealFloor",
    "effectScale",
}

#: Fields kept as null rather than "" when empty, so a missing value reads as
#: missing in TypeScript instead of as an empty string.
NULLABLE = {
    "endedEventFloor",
    "endedRevealFloor",
    "notes",
    "restrictions",
    "costValue",
    "duration",
    "slot",
    "level",
}


def _convert(row: dict[str, str]) -> dict[str, object]:
    out: dict[str, object] = {}
    for key, value in row.items():
        name = RENAMES.get(key, key)
        if name in NUMERIC:
            out[name] = int(value) if value != "" else None
        elif name in NULLABLE:
            out[name] = value if value != "" else None
        else:
            out[name] = value
    return out


def build(rows: dict[str, list[dict[str, str]]]) -> dict[str, object]:
    layout = compute_layout(rows["entities"], rows["edges"])
    return {
        "version": BUNDLE_VERSION,
        "maxFloor": MAX_FLOOR,
        "entities": [_convert(r) for r in rows["entities"]],
        "aliases": [_convert(r) for r in rows["aliases"]],
        "facts": [_convert(r) for r in rows["facts"]],
        "status": [_convert(r) for r in rows["status"]],
        "edges": [_convert(r) for r in rows["edges"]],
        "mechanics": [_convert(r) for r in rows["mechanics"]],
        "holdings": [_convert(r) for r in rows["holdings"]],
        "stats": [_convert(r) for r in rows["stats"]],
        "layout": layout,
    }


def main() -> int:
    rows = read_tables()
    issues = validate(rows)
    for issue in issues:
        print(issue, file=sys.stderr if issue.level == "error" else sys.stdout)
    if errors(issues):
        print("refusing to compile: validation failed", file=sys.stderr)
        return 1

    bundle = build(rows)
    DIST.parent.mkdir(parents=True, exist_ok=True)
    # sort_keys and a trailing newline keep the diff readable when only the data
    # changed. No timestamp, so recompiling unchanged input is a no-op in git.
    DIST.write_text(json.dumps(bundle, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    counts = ", ".join(
        f"{len(bundle[t])} {t}"
        for t in ("entities", "aliases", "facts", "status", "edges", "mechanics", "holdings", "stats")
    )
    print(f"wrote {DIST.relative_to(ROOT)} v{BUNDLE_VERSION}: {counts}, {len(bundle['layout'])} laid out")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
