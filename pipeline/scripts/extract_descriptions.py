"""Pull a plain description for each entity from its wiki page.

The records read as datasheets: predicates and objects with no prose. This adds
the sentence or two that says what a thing actually is.

Spoiler safety comes from the wiki's own markup. Editors wrap later-book
material in {{Spoiler|book=N|spoiler=...}} and flag spoiler sections with
{{SpoilH|N}}. Both are stripped before anything is kept, so a description
carries only the baseline that stands at the entity's introduction.
"""

from __future__ import annotations

import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "wiki"
CURATED = ROOT / "data" / "curated"

MAX = 420


def drop_templates(text: str, name: str = "") -> str:
    """Remove {{name ...}} blocks, or every template when no name is given.

    Brace-matched rather than regex: templates nest, since almost every one of
    them contains a {{cite}}, and a flat pattern stops at the inner closer and
    leaves the outer half behind.
    """
    pattern = re.compile(r"\{\{" + (name if name else ""), re.I)
    out, i = [], 0
    while i < len(text):
        m = pattern.match(text, i)
        if not m:
            out.append(text[i])
            i += 1
            continue
        depth, i = 2, m.end()
        while i < len(text) and depth:
            if text.startswith("{{", i):
                depth += 2
                i += 2
            elif text.startswith("}}", i):
                depth -= 2
                i += 2
            else:
                i += 1
    return "".join(out)


def clean(text: str) -> str:
    text = drop_templates(text, "Spoiler")
    # A spoiler heading marker means everything after it in this block is later.
    text = re.split(r"\{\{SpoilH", text)[0]
    text = re.sub(r"<ref[^>]*>.*?</ref>|<ref[^>]*/>", "", text, flags=re.S)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    # Everything else: infoboxes, quotes, navboxes, citation tags.
    text = drop_templates(text)
    # File and image links carry a caption after a pipe, which otherwise
    # survives as "Something.webp|Art by ...".
    text = re.sub(r"\[\[(?:File|Image):[^\]]*\]\]", "", text, flags=re.I)
    text = re.sub(r"\S+\.(?:webp|jpe?g|png|gif)\|[^\n]*", "", text, flags=re.I)
    text = re.sub(r"\[\[([^\]|]*\|)?([^\]]*)\]\]", r"\2", text)
    text = re.sub(r"'''?", "", text)
    text = re.sub(r"<[^>]+>", " ", text)
    # Any sub-heading ends the description: what follows is Gallery or Trivia.
    text = re.split(r"={3,}", text)[0]
    return re.sub(r"\s+", " ", text).strip(" |*")


def section(text: str, *names: str) -> str:
    for name in names:
        m = re.search(r"(=+)\s*" + name + r"\s*\1", text, re.I)
        if not m:
            continue
        depth = len(m.group(1))
        rest = text[m.end():]
        nxt = re.search(r"\n={1," + str(depth) + r"}[^=]", rest)
        block = rest[: nxt.start()] if nxt else rest
        # A Gallery or Trivia sub-heading inside Description is not description.
        block = re.split(r"\n=====?[^=]", block)[0]
        body = clean(block)
        if len(body) > 40:
            return body
    return ""


def trim(text: str) -> str:
    """Whole sentences, up to roughly MAX characters."""
    if len(text) <= MAX:
        return text
    cut = text[:MAX]
    stop = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    return (cut[: stop + 1] if stop > 120 else cut.rstrip() + "…").strip()


def main() -> int:
    p = CURATED / "entities.csv"
    rows = list(csv.DictReader(p.open()))
    fields = list(rows[0].keys())
    if "description" not in fields:
        fields.insert(fields.index("notes"), "description")

    filled = 0
    for row in rows:
        row.setdefault("description", "")
        if row.get("description"):
            continue
        path = RAW / f"{row['canonical_name'].replace(' ', '_')}.wiki"
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        body = section(text, "Description", "Appearance", "Overview")
        if not body:
            # Fall back to the lead paragraph before the first heading.
            body = clean(re.split(r"\n=", text)[0])
        if len(body) > 40:
            row["description"] = trim(body)
            filled += 1

    with p.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields); w.writeheader(); w.writerows(rows)
    print(f"described {filled} of {len(rows)} entities")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
