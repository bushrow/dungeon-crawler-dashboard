"""Per-book level and stat tables from the main character pages.

The per-floor pages stop after floor 2, but the main pages carry a Levels table
for almost every book and a Stats table for a few. Book 1 covers floors 1 and 2,
and from book 2 on each book is one floor, so book N maps to floor N + 1.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

RAW = Path(__file__).resolve().parents[2] / "data" / "raw" / "wiki"
CHARACTERS = {"carl": "Carl", "donut": "Donut"}

CAPTION = r"(?:\|\+|\| colspan=\"\d+\" \|)'''Book (\d) (Levels|Stats)'''"


def number(cell: str) -> int | None:
    cell = re.sub(r"\{\{[^}]*\}\}|<[^>]+>|'''", "", cell)
    # "9/12*" is base/effective; the sheet shows what the crawler has.
    found = re.findall(r"\d+", cell.replace("*", ""))
    return int(found[-1]) if found else None


def tables(text: str) -> dict[tuple[str, str], str]:
    out: dict[tuple[str, str], str] = {}
    for m in re.finditer(CAPTION, text):
        end = text.find("\n|}", m.end())
        out[(m.group(1), m.group(2))] = text[m.end() : end if end > 0 else len(text)]
    return out


def rows_of(body: str) -> list[list[str]]:
    out = []
    for chunk in body.split("|-"):
        cells = [c.strip() for c in re.split(r"\n\s*\|(?!\|)", chunk) if c.strip()]
        cells = [c for c in cells if not c.startswith("!") and "colspan" not in c]
        if cells:
            out.append(cells)
    return out


def main() -> int:
    result: dict[str, dict[str, dict]] = {}
    for cid, page in CHARACTERS.items():
        text = (RAW / f"{page}.wiki").read_text(encoding="utf-8")
        found = tables(text)
        for (book, kind), body in sorted(found.items()):
            floor = 2 if book == "1" else int(book) + 1
            slot = result.setdefault(cid, {}).setdefault(str(floor), {"book": int(book)})
            rows = rows_of(body)
            if kind == "Levels":
                levels = [number(r[0]) for r in rows if number(r[0]) is not None]
                if levels:
                    slot["level"] = max(levels)
            else:
                # Page, Reason, STR, INT, CON, DEX, CHR
                usable = [r for r in rows if len(r) >= 7]
                if usable:
                    last = usable[-1]
                    keys = ("str", "int", "con", "dex", "cha")
                    values = [number(c) for c in last[2:7]]
                    if all(v is not None for v in values):
                        slot.update(dict(zip(keys, values)))
    print(json.dumps(result, indent=1, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
