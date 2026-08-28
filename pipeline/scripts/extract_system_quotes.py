"""Take a short excerpt of the System's own description for each entity.

The System's voice is the funniest thing in the series and says more about a
class or a mob than any paraphrase. It is also verbatim text from a published
novel, so the excerpt is bounded: one or two sentences, hard-capped at WORD_CAP
words, attributed in the interface and linked to the page it came from.

The project's original IP posture kept this out entirely. That was amended
deliberately; see docs/superpowers/specs for the note.
"""

from __future__ import annotations

import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw" / "wiki"
CURATED = ROOT / "data" / "curated"

#: Bounded quotation, not reproduction.
WORD_CAP = 26

#: An entry opens with a stat block before the writing starts: the entity's
#: name, "Level 65", "Neighborhood Boss!", "Legendary Creature". Those are
#: short and title-cased. Actual System prose is a sentence.
STAT_LINE = re.compile(r"^\s*(level\s*\d+|female|male|small|large|description for\b)", re.I)

#: Editors talking about the entry rather than the System talking. The wiki
#: declines to reproduce the longest of these on fair-use grounds, and says so
#: in the page body, which is exactly the kind of line that must not be quoted
#: back as if the System said it.
EDITORIAL = re.compile(
    r"\b(ai description|full text|pp\.|copyright|fair use|reproduc|this (page|article)|wiki)\b",
    re.I,
)


def is_prose(sentence: str, name: str) -> bool:
    """A real sentence, as opposed to a fragment of the stat block."""
    words = sentence.split()
    if len(words) < 5:
        return False
    if STAT_LINE.match(sentence) or EDITORIAL.search(sentence):
        return False
    if name and name.lower() in sentence.lower() and len(words) < 9:
        return False
    # Stat fragments are almost all capitalised; prose is not.
    capitalised = sum(1 for w in words if w[:1].isupper())
    return capitalised / len(words) < 0.6


def drop_templates(text: str, name: str = "") -> str:
    pattern = re.compile(r"\{\{" + (name if name else ""), re.I)
    out, i = [], 0
    while i < len(text):
        m = pattern.match(text, i)
        if not m:
            out.append(text[i]); i += 1; continue
        depth, i = 2, m.end()
        while i < len(text) and depth:
            if text.startswith("{{", i): depth += 2; i += 2
            elif text.startswith("}}", i): depth -= 2; i += 2
            else: i += 1
    return "".join(out)


def clean(text: str) -> str:
    text = drop_templates(text, "Spoiler")
    text = re.split(r"\{\{SpoilH", text)[0]
    text = re.sub(r"<ref[^>]*>.*?</ref>|<ref[^>]*/>", "", text, flags=re.S)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    # A comment that opened before this section leaves its closer behind.
    text = text.replace("-->", " ").replace("<!--", " ")
    text = drop_templates(text)
    text = re.sub(r"\[\[(?:File|Image):[^\]]*\]\]", "", text, flags=re.I)
    text = re.sub(r"\[\[([^\]|]*\|)?([^\]]*)\]\]", r"\2", text)
    text = re.sub(r"'''?", "", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.split(r"={3,}", text)[0]
    return re.sub(r"\s+", " ", text).strip(" |*\"“”")


def excerpt(body: str, name: str) -> str:
    # Walk past the stat block to the first sentence that reads as writing.
    sentences = re.split(r"(?<=[.!?])\s+", body)
    start = next((i for i, x in enumerate(sentences) if is_prose(x, name)), None)
    if start is None:
        return ""

    words, taken = " ".join(sentences[start:]).split(), []
    for word in words:
        taken.append(word)
        if len(taken) >= 6 and word.endswith((".", "!", "?")):
            break
        if len(taken) >= WORD_CAP:
            break
    text = " ".join(taken).strip(" \"“”")
    # An unbalanced curly quote left over from splitting mid-dialogue.
    if text.count("“") != text.count("”"):
        text = text.replace("“", "").replace("”", "")
    if len(words) > len(taken):
        text = text.rstrip(".,;: ") + "…"
    return text if len(text.split()) >= 5 else ""


def main() -> int:
    p = CURATED / "entities.csv"
    rows = list(csv.DictReader(p.open()))
    fields = list(rows[0].keys())
    if "system_quote" not in fields:
        fields.insert(fields.index("notes"), "system_quote")

    filled = 0
    for row in rows:
        row.setdefault("system_quote", "")
        path = RAW / f"{row['canonical_name'].replace(' ', '_')}.wiki"
        if row.get("system_quote") or not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        m = re.search(r"(=+)\s*AI Description\s*\1", text, re.I)
        if not m:
            continue
        depth = len(m.group(1))
        rest = text[m.end():]
        nxt = re.search(r"\n={1," + str(depth) + r"}[^=]", rest)
        quote = excerpt(clean(rest[: nxt.start()] if nxt else rest), row['canonical_name'])
        if quote:
            row["system_quote"] = quote
            filled += 1

    with p.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields); w.writeheader(); w.writerows(rows)
    print(f"quoted {filled} of {len(rows)} entities")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
