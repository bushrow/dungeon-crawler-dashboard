"""Derive dated relationships from cited wiki fields.

The Atlas went static after floor 3 because every authored edge sat at floor 3
or below. Character infoboxes list allies and organisations, but most are
undated and current as of book 8, so using them as-is would show an alliance
formed in book 7 to a reader on floor 4.

Only cited fields are used. Where a field carries several citations, the
*latest* one dates the edge: the citations cover the field as a whole, so the
last one is the first floor by which every name in it is known. That puts some
relationships a floor later than they really formed, which is the safe
direction and the same bias used for floors and for deaths.
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "wiki"
CURATED = ROOT / "data" / "curated"

#: infobox field -> edge type, from the subject's point of view.
CHARACTER_FIELDS = {
    "allies": "allied",
    "enemies": "hostile",
    "party": "party",
    "guild": "subordinate",
    "organizations": "subordinate",
}


def floor_of_book(book: int) -> int:
    return 2 if book == 1 else book + 1


def latest_floor(text: str) -> int | None:
    books = [int(b) for b in re.findall(r"\{\{cite\|(\d+)\|", text)]
    return floor_of_book(max(books)) if books else None


def links(text: str) -> list[str]:
    return [m.split("|")[0].strip() for m in re.findall(r"\[\[([^\]]+)\]\]", text)]


def field(text: str, name: str) -> str | None:
    m = re.search(r"^\s*\|\s*" + name + r"\s*=([^\n]*)", text, re.M)
    return m.group(1) if m and m.group(1).strip() else None


def main() -> int:
    ents = list(csv.DictReader((CURATED / "entities.csv").open()))
    by_name = {e["canonical_name"].lower(): e for e in ents}
    by_id = {e["id"]: e for e in ents}

    rows = list(csv.DictReader((CURATED / "edges.csv").open()))
    fields = list(rows[0].keys())
    seen = {(r["src"], r["dst"], r["type"]) for r in rows}
    seen |= {(r["dst"], r["src"], r["type"]) for r in rows}

    added = 0

    def emit(src: str, dst: str, kind: str, floor: int, source: str) -> None:
        nonlocal added
        if src == dst or (src, dst, kind) in seen:
            return
        a, b = by_id.get(src), by_id.get(dst)
        if not a or not b:
            return
        # The edge cannot be visible before either end is.
        floor = max(floor, int(a["introduced_floor"]), int(b["introduced_floor"]))
        seen.add((src, dst, kind)); seen.add((dst, src, kind))
        rows.append({"src": src, "dst": dst, "type": kind,
                     "event_floor": str(floor), "reveal_floor": str(floor),
                     "ended_event_floor": "", "ended_reveal_floor": "",
                     "confidence": "probable"})
        added += 1

    def resolve(name: str) -> str | None:
        hit = by_name.get(name.lower())
        return hit["id"] if hit else None

    for entity in ents:
        path = RAW / f"{entity['canonical_name'].replace(' ', '_')}.wiki"
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")

        if entity["type"] == "character":
            for name, kind in CHARACTER_FIELDS.items():
                raw = field(text, name)
                floor = latest_floor(raw) if raw else None
                if not raw or floor is None:
                    continue
                for target in links(raw):
                    other = resolve(target)
                    if other:
                        emit(entity["id"], other, kind, floor, name)

        if entity["type"] == "faction":
            # A members list is cited per sub-group, split on semicolons, so
            # each group of names is dated by its own citation.
            raw = field(text, "members")
            if raw:
                for segment in raw.split(";"):
                    floor = latest_floor(segment)
                    if floor is None:
                        continue
                    for target in links(segment):
                        other = resolve(target)
                        if other:
                            emit(other, entity["id"], "subordinate", floor, "members")
            raw = field(text, "head")
            floor = latest_floor(raw) if raw else None
            if raw and floor is not None:
                for target in links(raw):
                    other = resolve(target)
                    if other:
                        emit(other, entity["id"], "sponsor", floor, "head")

    with (CURATED / "edges.csv").open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields); w.writeheader(); w.writerows(rows)
    print(f"edges +{added} -> {len(rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
