"""Turn fetched wiki pages into entity and fact rows for the floors they belong to.

Type comes from the infobox template the page uses, and floor from the lowest
numbered floor category the page appears in. Facts are transcribed one infobox
field to one predicate, so the claim is checkable against its page and my
judgment stays out of it.
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "wiki"
CATS = RAW / "_categories"
CURATED = ROOT / "data" / "curated"

TEMPLATE_TYPE = {
    "Character info": "character",
    "Character": "character",
    "Class": "class",
    "Item": "item",
    "Spells": "skill",
    "Group": "faction",
    "Dungeon Floor": "location",
}

FIELDS = [
    ("effect", "does"), ("effects", "does"), ("target", "targets"),
    ("duration", "lasts"), ("cost", "costs"), ("bonuses", "has_advantage"),
    ("penalties", "has_weakness"), ("source", "comes_from"),
    ("prerequisites", "requires"), ("occupation", "works_as"),
    ("origin", "comes_from"), ("associated equipment", "is_associated_with"),
]

SKIP_FIELDS = ("image", "caption", "title", "status", "level", "class", "gear", "abilities",
               "affiliations", "conditions", "party", "guild", "organizations", "weapon",
               "skills", "spells", "allies", "enemies", "titles", "species", "npcs",
               "crawlers", "first_appearance", "6th_floor", "9th_floor", "deities")


def slug(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    return re.sub(r"^(the|enchanted)_", "", s)[:56] or "x"


def clean(v: str) -> str:
    v = re.sub(r"<ref[^>]*>.*?</ref>|<ref[^>]*/>", "", v, flags=re.S)
    v = re.sub(r"\{\{cite\|[^}]*\}\}", "", v)
    v = re.sub(r"\[\[([^\]|]*\|)?([^\]]*)\]\]", r"\2", v)
    v = re.sub(r"'''?|<[^>]+>", " ", v)
    v = re.sub(r"\s*\*\s*", ", ", v)
    return re.sub(r"\s+", " ", v).strip(" ,*|")


def infobox(text: str) -> tuple[str, dict[str, str]]:
    m = re.search(r"\{\{(" + "|".join(re.escape(t) for t in TEMPLATE_TYPE) + r"|Race Infobox|Race)\b", text)
    if not m:
        return "", {}
    name = m.group(1)
    i, depth, buf, parts = m.end(), 2, [], []
    while i < len(text) and depth > 0:
        two = text[i : i + 2]
        if two == "{{":
            depth += 2; buf.append(two); i += 2; continue
        if two == "}}":
            depth -= 2
            if depth == 0: break
            buf.append(two); i += 2; continue
        if text[i] == "|" and depth == 2 and text.count("[[", 0, i) == text.count("]]", 0, i):
            parts.append("".join(buf)); buf = []; i += 1; continue
        buf.append(text[i]); i += 1
    parts.append("".join(buf))

    fields = {}
    for part in parts:
        if "=" not in part: continue
        k, _, v = part.partition("=")
        k = k.strip().lower()
        if any(k.startswith(s) for s in SKIP_FIELDS): continue
        val = clean(v)
        if val and not val.lower().startswith(("n/a", "{{pagename", "unknown")):
            fields[k] = val
    return name, fields


def floors_by_page() -> dict[str, int]:
    out: dict[str, int] = {}
    for f in range(1, 10):
        path = CATS / f"Floor_{f}.txt"
        if not path.exists(): continue
        for line in path.read_text().splitlines():
            n = line.strip()
            if n and not n.startswith("Category:"):
                out.setdefault(n, f)
    return out


def main() -> int:
    floors = floors_by_page()

    ents = list(csv.DictReader((CURATED / "entities.csv").open()))
    efields = list(ents[0].keys())
    known_ids = {e["id"] for e in ents}
    known_names = {e["canonical_name"].lower(): e["id"] for e in ents}

    facts = list(csv.DictReader((CURATED / "facts.csv").open()))
    ffields = list(facts[0].keys())
    seen_fact = {(f["subject_id"], f["predicate"], f["object"]) for f in facts}
    next_id = max(int(f["id"][1:]) for f in facts)

    added_e = added_f = 0
    for title, floor in sorted(floors.items()):
        if floor < 4:                      # floors 0-3 are already authored
            continue
        path = RAW / f"{title.replace('/', '-').replace(' ', '_')}.wiki"
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        template, fields = infobox(text)
        if not template:
            continue

        kind = TEMPLATE_TYPE.get(template)
        if kind is None:                   # Race Infobox / Race
            kind = "monster" if "mob" in fields.get("type", "").lower() else "race"

        eid = known_names.get(title.lower()) or slug(title)
        if eid not in known_ids:
            known_ids.add(eid); known_names[title.lower()] = eid
            ents.append({"id": eid, "type": kind, "canonical_name": title,
                         "introduced_floor": str(floor), "notes": ""})
            added_e += 1

        for field, predicate in FIELDS:
            value = fields.get(field)
            if not value or len(value) > 180:
                continue
            key = (eid, predicate, value)
            if key in seen_fact:
                continue
            seen_fact.add(key); next_id += 1; added_f += 1
            facts.append({"id": f"f{next_id:03d}", "subject_id": eid, "predicate": predicate,
                          "object": value, "event_floor": str(floor), "reveal_floor": str(floor),
                          "significance_floor": str(floor),
                          "source": f"wiki:{title.replace(' ', '_')}",
                          "confidence": "certain", "notes": ""})

    with (CURATED / "entities.csv").open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=efields); w.writeheader(); w.writerows(ents)
    with (CURATED / "facts.csv").open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=ffields); w.writeheader(); w.writerows(facts)
    print(f"entities +{added_e} -> {len(ents)} | facts +{added_f} -> {len(facts)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
