"""Schema and invariant checks over the curated tables.

Runs twice: against `data/curated/` before compiling, and against the assembled
bundle before it is written. A bundle is never written unvalidated.
"""

from __future__ import annotations

import csv
import sys
from dataclasses import dataclass
from pathlib import Path

from .schema import PRICEABLE_TYPES, TABLE_ORDER, TABLES

Rows = dict[str, list[dict[str, str]]]

CURATED = Path(__file__).resolve().parents[2] / "data" / "curated"


@dataclass(frozen=True)
class Issue:
    level: str  # "error" | "warning"
    table: str
    row: int  # 1-based, matching the CSV line after the header
    message: str

    def __str__(self) -> str:
        return f"{self.level}: {self.table}[{self.row}]: {self.message}"


def read_tables(directory: Path = CURATED) -> Rows:
    """Read every curated CSV. Missing files read as empty, not as an error."""
    out: Rows = {}
    for name in TABLE_ORDER:
        path = directory / f"{name}.csv"
        if not path.exists():
            out[name] = []
            continue
        with path.open(newline="", encoding="utf-8") as fh:
            out[name] = [
                {k: (v or "").strip() for k, v in row.items() if k is not None}
                for row in csv.DictReader(fh)
            ]
    return out


def _as_int(value: str) -> int | None:
    try:
        return int(value)
    except ValueError:
        return None


def _check_columns(rows: Rows) -> list[Issue]:
    """Per-cell checks: presence, type, enum membership, foreign keys."""
    issues: list[Issue] = []
    ids = {
        table: {r.get("id", "") for r in rows.get(table, [])}
        for table in ("entities", "facts")
    }

    for name in TABLE_ORDER:
        table = TABLES[name]
        seen: set[tuple[str, ...]] = set()

        for i, row in enumerate(rows.get(name, []), start=1):
            missing = [c.name for c in table.columns if c.name not in row]
            if missing:
                issues.append(Issue("error", name, i, f"missing columns {missing}"))
                continue

            for col in table.columns:
                value = row[col.name]

                if not value:
                    if col.required:
                        issues.append(
                            Issue("error", name, i, f"{col.name} is required")
                        )
                    continue

                if col.kind in ("int", "floor"):
                    n = _as_int(value)
                    if n is None:
                        issues.append(
                            Issue("error", name, i, f"{col.name}={value!r} is not an integer")
                        )
                    elif col.kind == "floor" and n < 0:
                        issues.append(
                            Issue("error", name, i, f"{col.name}={n} is below floor 0")
                        )
                elif col.kind == "enum" and value not in col.values:
                    issues.append(
                        Issue(
                            "error",
                            name,
                            i,
                            f"{col.name}={value!r} not in {list(col.values)}",
                        )
                    )
                elif col.kind == "ref" and value not in ids.get(col.ref, set()):
                    issues.append(
                        Issue(
                            "error",
                            name,
                            i,
                            f"{col.name}={value!r} does not resolve in {col.ref}",
                        )
                    )

            if table.unique:
                key = tuple(row.get(c, "") for c in table.unique)
                if key in seen:
                    issues.append(
                        Issue("error", name, i, f"duplicate {list(table.unique)}={list(key)}")
                    )
                seen.add(key)

    return issues


def _check_clocks(rows: Rows) -> list[Issue]:
    """The two-clock rules. See data/SCHEMA.md."""
    issues: list[Issue] = []

    for i, row in enumerate(rows.get("facts", []), start=1):
        event, reveal = _as_int(row.get("event_floor", "")), _as_int(row.get("reveal_floor", ""))
        signif = _as_int(row.get("significance_floor", ""))

        if reveal is not None and signif is not None and signif < reveal:
            issues.append(
                Issue(
                    "error",
                    "facts",
                    i,
                    f"significance_floor {signif} precedes reveal_floor {reveal}: "
                    "a gloss cannot land before the claim it glosses",
                )
            )

        # Prophecy and foreshadowing genuinely reveal before the event. Legal,
        # but it must be deliberate, so it has to carry a note.
        if event is not None and reveal is not None and event > reveal:
            if row.get("notes"):
                issues.append(
                    Issue(
                        "warning",
                        "facts",
                        i,
                        f"event_floor {event} follows reveal_floor {reveal} (foreshadowed)",
                    )
                )
            else:
                issues.append(
                    Issue(
                        "error",
                        "facts",
                        i,
                        f"event_floor {event} follows reveal_floor {reveal} but notes is "
                        "empty: foreshadowing must be deliberate, not a typo",
                    )
                )

    for i, row in enumerate(rows.get("status", []), start=1):
        event, reveal = _as_int(row.get("event_floor", "")), _as_int(row.get("reveal_floor", ""))
        if event is not None and reveal is not None and event > reveal:
            issues.append(
                Issue(
                    "error",
                    "status",
                    i,
                    f"event_floor {event} follows reveal_floor {reveal}: status carries no "
                    "note column and may not be foreshadowed",
                )
            )

    for i, row in enumerate(rows.get("edges", []), start=1):
        reveal = _as_int(row.get("reveal_floor", ""))
        ended_event = _as_int(row.get("ended_event_floor", "") or "")
        ended_reveal = _as_int(row.get("ended_reveal_floor", "") or "")

        if reveal is not None and ended_reveal is not None and ended_reveal < reveal:
            issues.append(
                Issue(
                    "error",
                    "edges",
                    i,
                    f"ended_reveal_floor {ended_reveal} precedes reveal_floor {reveal}: an "
                    "edge cannot be known to have ended before it is known to exist",
                )
            )
        if (ended_event is None) != (ended_reveal is None):
            issues.append(
                Issue(
                    "error",
                    "edges",
                    i,
                    "ended_event_floor and ended_reveal_floor must both be set or both empty",
                )
            )
        if row.get("src") and row.get("src") == row.get("dst"):
            issues.append(Issue("error", "edges", i, "src and dst are the same entity"))

    return issues


def _check_visibility(rows: Rows) -> list[Issue]:
    """A record may not become visible before its subject does.

    Without this, a reader at floor 2 sees an alias, fact, or edge hanging off an
    entity they have not met. The access layer would filter correctly and the
    data would still leak.
    """
    issues: list[Issue] = []
    introduced = {
        r["id"]: _as_int(r.get("introduced_floor", ""))
        for r in rows.get("entities", [])
        if r.get("id")
    }

    def floor_of(entity_id: str) -> int | None:
        return introduced.get(entity_id)

    def check(table: str, i: int, reveal: int | None, refs: list[str], label: str) -> None:
        if reveal is None:
            return
        for ref in refs:
            got = floor_of(ref)
            if got is not None and reveal < got:
                issues.append(
                    Issue(
                        "error",
                        table,
                        i,
                        f"{label} {reveal} precedes introduced_floor {got} of {ref!r}",
                    )
                )

    for i, row in enumerate(rows.get("aliases", []), start=1):
        check("aliases", i, _as_int(row.get("reveal_floor", "")), [row.get("entity_id", "")], "reveal_floor")

    for i, row in enumerate(rows.get("facts", []), start=1):
        check("facts", i, _as_int(row.get("reveal_floor", "")), [row.get("subject_id", "")], "reveal_floor")

    for i, row in enumerate(rows.get("status", []), start=1):
        check("status", i, _as_int(row.get("reveal_floor", "")), [row.get("entity_id", "")], "reveal_floor")

    for i, row in enumerate(rows.get("edges", []), start=1):
        check(
            "edges",
            i,
            _as_int(row.get("reveal_floor", "")),
            [row.get("src", ""), row.get("dst", "")],
            "reveal_floor",
        )

    types = {r["id"]: r.get("type", "") for r in rows.get("entities", []) if r.get("id")}
    for i, row in enumerate(rows.get("mechanics", []), start=1):
        entity_id = row.get("entity_id", "")
        check("mechanics", i, _as_int(row.get("introduced_floor", "")), [entity_id], "introduced_floor")

        kind = types.get(entity_id)
        if kind is not None and kind not in PRICEABLE_TYPES:
            issues.append(
                Issue(
                    "error",
                    "mechanics",
                    i,
                    f"entity {entity_id!r} is a {kind}, which carries no price "
                    f"(expected one of {list(PRICEABLE_TYPES)})",
                )
            )

        scale = _as_int(row.get("effect_scale", ""))
        if scale is not None and not 1 <= scale <= 5:
            issues.append(
                Issue("error", "mechanics", i, f"effect_scale {scale} is outside 1..5")
            )

    return issues


def validate(rows: Rows) -> list[Issue]:
    """Every check, in one pass. Errors and warnings together, in table order."""
    return _check_columns(rows) + _check_clocks(rows) + _check_visibility(rows)


def errors(issues: list[Issue]) -> list[Issue]:
    return [i for i in issues if i.level == "error"]


def main() -> int:
    rows = read_tables()
    issues = validate(rows)
    for issue in issues:
        print(issue, file=sys.stderr if issue.level == "error" else sys.stdout)

    failed = errors(issues)
    counted = ", ".join(f"{len(rows[t])} {t}" for t in TABLE_ORDER)
    print(f"validated {counted}")
    if failed:
        print(f"{len(failed)} error(s)", file=sys.stderr)
        return 1
    warned = len(issues)
    print(f"no errors, {warned} warning(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
