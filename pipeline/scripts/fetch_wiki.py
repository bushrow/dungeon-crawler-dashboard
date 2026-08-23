"""Pull source pages from the Dungeon Crawler Carl wiki into data/raw/.

Raw pages are gitignored. Nothing here is published: the curated tables carry
structured facts and paraphrase with a source reference, never wiki prose.

Fandom blocks plain page requests but serves the MediaWiki API, so this goes
through the API rather than scraping rendered HTML.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://dungeon-crawler-carl.fandom.com/api.php"
RAW = Path(__file__).resolve().parents[2] / "data" / "raw" / "wiki"
UA = "dcc-dashboard-corpus-builder/0.1 (personal fan project; contact via github.com/bushrow)"


def call(**params) -> dict:
    params.setdefault("format", "json")
    url = f"{API}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def category_members(category: str) -> list[str]:
    titles: list[str] = []
    cont: dict[str, str] = {}
    while True:
        data = call(
            action="query",
            list="categorymembers",
            cmtitle=f"Category:{category}",
            cmlimit="500",
            **cont,
        )
        titles += [m["title"] for m in data.get("query", {}).get("categorymembers", [])]
        if "continue" not in data:
            return titles
        cont = data["continue"]


def fetch(title: str) -> str | None:
    data = call(action="parse", page=title, prop="wikitext")
    if "error" in data:
        return None
    return data["parse"]["wikitext"]["*"]


def slug(title: str) -> str:
    return title.replace("/", "-").replace(" ", "_")


def main(argv: list[str]) -> int:
    RAW.mkdir(parents=True, exist_ok=True)

    if argv and argv[0] == "--categories":
        for category in argv[1:]:
            members = category_members(category)
            print(f"{category}: {len(members)}")
            for title in members:
                print(f"  {title}")
        return 0

    titles = argv or []
    if not titles:
        print("usage: fetch_wiki.py <page title> [...] | --categories <Category> [...]", file=sys.stderr)
        return 1

    index_path = RAW / "_index.json"
    index = json.loads(index_path.read_text()) if index_path.exists() else {}

    for title in titles:
        text = fetch(title)
        if text is None:
            print(f"missing: {title}", file=sys.stderr)
            continue
        path = RAW / f"{slug(title)}.wiki"
        path.write_text(text, encoding="utf-8")
        index[title] = {
            "url": f"https://dungeon-crawler-carl.fandom.com/wiki/{urllib.parse.quote(title.replace(' ', '_'))}",
            "file": path.name,
            "chars": len(text),
            "fetched": time.strftime("%Y-%m-%d"),
        }
        print(f"{title}: {len(text)} chars")
        time.sleep(0.4)

    index_path.write_text(json.dumps(index, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
