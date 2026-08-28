"""Parse the wiki's per-floor character pages into sheet data.

Carl and Donut are the only two crawlers with floor-scoped pages. Every other
character has a single infobox whose gear and level are series-current, so
reading those would put book 8 loadout on a floor 2 sheet.

Emits, for each character and floor: the end-of-floor stat line, the equipped
gear by slot, and the skills and spells known.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

RAW = Path(__file__).resolve().parents[2] / "data" / "raw" / "wiki"

CHARACTERS = {"carl": "Carl", "donut": "Donut"}
FLOORS = (1, 2, 3)


def clean(value: str) -> str:
    value = re.sub(r"\{\{cite\|[^}]*\}\}", "", value)
    value = re.sub(r"<ref[^>]*>.*?</ref>|<ref[^>]*/>", "", value, flags=re.S)
    value = re.sub(r"<sup>.*?</sup>", "", value, flags=re.S)
    value = re.sub(r"\[\[([^\]|]*)\|([^\]]*)\]\]", r"\1", value)  # keep the link target
    value = re.sub(r"\[\[([^\]]*)\]\]", r"\1", value)
    value = re.sub(r"'''?", "", value)
    value = re.sub(r"<[^>]+>", " ", value)
    # Footnote markers like [a] or [acd] tag which item is granting a bonus.
    value = re.sub(r"\[[a-z]{1,4}\]", "", value)
    return re.sub(r"\s+", " ", value).strip()


def section(text: str, name: str) -> str:
    """Body of a heading, up to the next heading of the same or higher level."""
    m = re.search(r"(=+)\s*" + re.escape(name) + r"\s*\1", text)
    if not m:
        return ""
    depth = len(m.group(1))
    rest = text[m.end():]
    nxt = re.search(r"\n={1," + str(depth) + r"}[^=]", rest)
    return rest[: nxt.start()] if nxt else rest


def last_stat_row(text: str) -> dict[str, int] | None:
    """The final row of the Levels & Stats table: the end-of-floor state."""
    body = section(text, "Levels & Stats")
    if not body:
        return None
    rows = []
    for chunk in body.split("|-"):
        cells = [clean(c) for c in re.split(r"\n\s*\|(?!\|)", chunk)]
        nums = [c for c in cells if re.fullmatch(r"[\d/ ]+", c or "") and c.strip()]
        if len(nums) >= 6:
            rows.append(nums[-6:])
    if not rows:
        return None
    # "6/9" is base/effective; the sheet shows what the crawler actually has.
    take = lambda c: int(c.split("/")[-1].strip())
    lvl, s, i, con, d, cha = rows[-1]
    return {"level": take(lvl), "str": take(s), "int": take(i),
            "con": take(con), "dex": take(d), "cha": take(cha)}


def ending_gear(text: str) -> list[tuple[str, str]]:
    """Slot to item. One slot can hold several things, so cells are split."""
    body = section(text, "Ending Gear")
    out: list[tuple[str, str]] = []
    for chunk in body.split("|-"):
        raw = [c for c in re.split(r"\n\s*\|(?!\|)", chunk) if c.strip()]
        raw = [c for c in raw if not c.lstrip().startswith("class=")]
        if len(raw) < 2:
            continue
        slot = clean(raw[0])
        # Several items in one slot are separated by a line break or a bullet.
        for piece in re.split(r"<br\s*/?>|\n\s*\*", raw[1]):
            item = clean(piece)
            if slot and item:
                out.append((slot, item))
    return out


def skill_table(text: str, name: str) -> list[tuple[str, int | None]]:
    """Skill or spell name with its end-of-floor level, from the wiki's table.

    These are tables, not lists: SKILL / STARTING LEVEL / FINAL LEVEL / NOTES.
    The final level is what the sheet shows.
    """
    body = section(text, name)
    if not body or "does not learn" in body.lower():
        return []

    out: list[tuple[str, int | None]] = []
    seen: set[str] = set()
    for chunk in body.split("|-"):
        cells = [c for c in re.split(r"\n\s*\|(?!\|)", chunk) if c.strip()]
        cells = [c for c in cells if not c.lstrip().startswith(("class=", "!"))]
        if not cells:
            continue
        m = re.match(r"\s*\[\[([^\]|]+)", cells[0])
        if not m:
            continue
        entry = m.group(1).strip()
        if entry in seen:
            continue
        seen.add(entry)
        # Column 3 is the final level when the table has one.
        level = None
        if len(cells) >= 3:
            digits = re.search(r"\d+", clean(cells[2]))
            if digits:
                level = int(digits.group())
        out.append((entry, level))
    return out


def main() -> int:
    result: dict[str, dict[str, dict]] = {}
    for cid, page in CHARACTERS.items():
        for floor in FLOORS:
            path = RAW / f"{page}-Floor_{floor}.wiki"
            if not path.exists():
                print(f"missing {path.name}", file=sys.stderr)
                continue
            text = path.read_text(encoding="utf-8")
            result.setdefault(cid, {})[str(floor)] = {
                "stats": last_stat_row(text),
                "gear": ending_gear(text),
                "skills": skill_table(text, "Skills"),
                "spells": skill_table(text, "Spells"),
            }
    print(json.dumps(result, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
