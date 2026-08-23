"""Pull infobox fields out of fetched wiki pages.

Reading two dozen pages by hand is slow and lossy. The infoboxes carry the
structured part (prerequisites, stat and skill grants, effects), which is
exactly what the mechanics table wants, so parse them and read the summary.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

RAW = Path(__file__).resolve().parents[2] / "data" / "raw" / "wiki"


def strip_markup(value: str) -> str:
    value = re.sub(r"<ref[^>]*/>", "", value)
    value = re.sub(r"<ref[^>]*>.*?</ref>", "", value, flags=re.S)
    value = re.sub(r"\[\[([^\]|]*\|)?([^\]]*)\]\]", r"\2", value)
    value = re.sub(r"'''?", "", value)
    value = re.sub(r"<[^>]+>", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip(" *")


def parse_infobox(text: str, name: str) -> dict[str, str]:
    """Split the leading {{Name ...}} template on top-level pipes."""
    match = re.search(r"\{\{" + name + r"\b", text)
    if not match:
        return {}

    i = match.end()
    depth, buf, parts = 2, [], []
    while i < len(text) and depth > 0:
        two = text[i : i + 2]
        if two == "{{":
            depth += 2
            buf.append(two)
            i += 2
            continue
        if two == "}}":
            depth -= 2
            if depth == 0:
                break
            buf.append(two)
            i += 2
            continue
        if text[i] == "|" and depth == 2 and text.count("[[", 0, i) == text.count("]]", 0, i):
            parts.append("".join(buf))
            buf = []
            i += 1
            continue
        buf.append(text[i])
        i += 1
    parts.append("".join(buf))

    fields: dict[str, str] = {}
    for part in parts[1:] if parts and "=" not in parts[0] else parts:
        if "=" not in part:
            continue
        key, _, value = part.partition("=")
        cleaned = strip_markup(value)
        if cleaned:
            fields[key.strip()] = cleaned
    return fields


def main(argv: list[str]) -> int:
    template = argv[0] if argv else "Class"
    keys = argv[1].split(",") if len(argv) > 1 else None

    for path in sorted(RAW.glob("*.wiki")):
        fields = parse_infobox(path.read_text(encoding="utf-8"), template)
        if not fields:
            continue
        print(f"\n### {path.stem}")
        for key, value in fields.items():
            if keys and key not in keys:
                continue
            print(f"  {key}: {value[:400]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
