"""Derive status rows from character pages, with the floor the reveal happens on.

Mortality is the highest-value spoiler in this series, so this is deliberately
strict. A departure is recorded only when the page's status field carries a book
citation, because that citation is the only thing that dates the reveal. A page
that says "Deceased" with no citation gets no row at all: absence of a row means
nothing, and a wrong floor here shows a reader a death several books early.
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "wiki"
CURATED = ROOT / "data" / "curated"

#: Book 1 covers floors 1 and 2; from book 2 on, one book is one floor.
def floor_of_book(book: int) -> int:
    return 2 if book == 1 else book + 1


def status_field(text: str) -> str | None:
    # Pipes appear inside the citation template, so the value runs to the end of
    # the line rather than to the next pipe.
    m = re.search(r"\n\s*\|\s*status\s*=([^\n]*)", text, re.I)
    return m.group(1) if m else None


def main() -> int:
    ents = {e["canonical_name"]: e for e in csv.DictReader((CURATED / "entities.csv").open())}
    rows = list(csv.DictReader((CURATED / "status.csv").open()))
    fields = list(rows[0].keys())
    have = {(r["entity_id"], r["status"]) for r in rows}

    added, skipped = 0, []
    for name, entity in sorted(ents.items()):
        if entity["type"] != "character":
            continue
        path = RAW / f"{name.replace(' ', '_')}.wiki"
        if not path.exists():
            continue
        raw = status_field(path.read_text(encoding="utf-8"))
        if not raw or "deceased" not in raw.lower():
            continue

        cite = re.search(r"\{\{cite\|(\d+)\|", raw)
        if not cite:
            skipped.append(name)
            continue

        floor = floor_of_book(int(cite.group(1)))
        introduced = int(entity["introduced_floor"])
        if floor < introduced:
            skipped.append(f"{name} (cited floor {floor} precedes introduction)")
            continue
        if (entity["id"], "departed") in have:
            continue
        rows.append({"entity_id": entity["id"], "status": "departed",
                     "event_floor": str(floor), "reveal_floor": str(floor)})
        added += 1

    rows.sort(key=lambda r: (int(r["reveal_floor"]), r["entity_id"]))
    with (CURATED / "status.csv").open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields); w.writeheader(); w.writerows(rows)

    print(f"departed +{added} -> {len(rows)} status rows")
    if skipped:
        print(f"no dated citation, so no row for {len(skipped)}: {', '.join(skipped[:8])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
