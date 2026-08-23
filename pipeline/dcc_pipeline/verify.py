"""Check that the committed bundle still matches the curated tables.

The bundle is committed, so it can drift from the data it came from. Editing a
CSV without recompiling would leave the apps serving stale records.

Everything except the layout must match exactly. Layout is compared with a
tolerance: the spring layout is seeded and reproducible on a given machine, but
numpy's floating-point results differ slightly between architectures, so an
exact comparison fails on CI for reasons that have nothing to do with the data.
"""

from __future__ import annotations

import json
import sys

from .compile import DIST, build
from .validate import read_tables

#: Scaled units. Well under one node radius, so a difference this small cannot
#: move a node anywhere a reader would notice.
TOLERANCE = 3


def differences(committed: dict, fresh: dict) -> list[str]:
    out: list[str] = []

    for key in sorted(set(committed) | set(fresh)):
        if key == "layout":
            continue
        if committed.get(key) != fresh.get(key):
            out.append(f"{key} differs from the curated tables")

    a, b = committed.get("layout", {}), fresh.get("layout", {})
    missing = sorted(set(b) - set(a))
    extra = sorted(set(a) - set(b))
    if missing:
        out.append(f"layout is missing {missing}")
    if extra:
        out.append(f"layout has entries for entities that are gone: {extra}")

    for node in sorted(set(a) & set(b)):
        for axis in ("x", "y"):
            drift = abs(a[node][axis] - b[node][axis])
            if drift > TOLERANCE:
                out.append(f"layout {node}.{axis} moved by {drift:.1f}, over the {TOLERANCE} tolerance")

    return out


def main() -> int:
    if not DIST.exists():
        print(f"{DIST} is missing; run 'npm run data'", file=sys.stderr)
        return 1

    committed = json.loads(DIST.read_text(encoding="utf-8"))
    fresh = build(read_tables())
    issues = differences(committed, fresh)

    for issue in issues:
        print(f"error: {issue}", file=sys.stderr)
    if issues:
        print("the committed bundle is stale; run 'npm run data' and commit the result", file=sys.stderr)
        return 1

    print("committed bundle matches the curated tables")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
