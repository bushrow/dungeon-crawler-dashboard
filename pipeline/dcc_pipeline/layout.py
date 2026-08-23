"""Freeze one graph layout over the whole corpus.

The layout runs once, here, over every node and edge regardless of horizon. The
apps render only the horizon-visible subgraph at these fixed coordinates, so a
node appears where it was always going to be and the rest of the graph does not
move when the slider does. Recomputing per floor would make the graph jump on
every tick, which destroys the one thing the view is for.

Running it at compile time also keeps the browser free of a physics loop and any
runtime dependency, and puts the coordinates in git where they can be reviewed.
"""

from __future__ import annotations

import networkx as nx

#: Node types the Atlas draws. Locations, items, and skills are corpus records,
#: not graph nodes.
GRAPH_TYPES = ("character", "faction")

SEED = 7

#: The graph panel is a wide rectangle, so the layout is computed in one. A
#: square layout letterboxes inside the panel and wastes most of its width.
SCALE_X = 1600.0
SCALE_Y = 900.0

#: Minimum gap between two nodes in scaled units. Spring layouts happily stack
#: weakly-connected nodes on top of each other, and a label sits under every
#: node, so a purely force-driven result is unreadable at this corpus size.
MIN_GAP = 150.0
RELAX_STEPS = 300


def graph_nodes(entities: list[dict]) -> list[str]:
    return [e["id"] for e in entities if e.get("type") in GRAPH_TYPES]


def compute(entities: list[dict], edges: list[dict]) -> dict[str, dict[str, float]]:
    """Return {entity_id: {"x": float, "y": float}} in a SCALE_X by SCALE_Y box."""
    nodes = graph_nodes(entities)
    keep = set(nodes)

    g = nx.Graph()
    g.add_nodes_from(nodes)
    for edge in edges:
        src, dst = edge.get("src", ""), edge.get("dst", "")
        if src in keep and dst in keep:
            g.add_edge(src, dst)

    if not nodes:
        return {}

    # Seeded, so the same corpus always produces the same coordinates and a
    # layout change shows up as a real diff rather than as noise.
    # k above the default spreads a sparse graph out instead of balling it up.
    raw = nx.spring_layout(g, seed=SEED, iterations=400, k=0.9)

    xs = [p[0] for p in raw.values()]
    ys = [p[1] for p in raw.values()]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)

    def norm(value: float, low: float, high: float, scale: float) -> float:
        span = high - low
        # A single node, or a degenerate axis, lands in the middle.
        return scale / 2 if span == 0 else (value - low) / span * scale

    scaled = {
        node: [
            norm(float(p[0]), x_min, x_max, SCALE_X),
            norm(float(p[1]), y_min, y_max, SCALE_Y),
        ]
        for node, p in sorted(raw.items())
    }
    _relax(scaled)

    # Integers, not decimals. The box is 1600 by 900, so whole units are finer
    # than the renderer can use, and sub-unit precision only serves to record
    # floating-point noise that differs between architectures.
    return {node: {"x": round(p[0]), "y": round(p[1])} for node, p in scaled.items()}


def _relax(points: dict[str, list[float]]) -> None:
    """Push overlapping nodes apart, in place.

    Deterministic: fixed step count, fixed iteration order, no randomness. Runs
    after scaling so MIN_GAP is expressed in the same units the renderer uses.
    """
    ids = list(points)
    for _ in range(RELAX_STEPS):
        moved = False
        for i, a in enumerate(ids):
            for b in ids[i + 1 :]:
                pa, pb = points[a], points[b]
                dx, dy = pb[0] - pa[0], pb[1] - pa[1]
                dist = (dx * dx + dy * dy) ** 0.5
                if dist >= MIN_GAP:
                    continue
                # Two nodes exactly on top of each other have no direction to
                # separate along, so nudge them apart on a fixed axis.
                if dist == 0:
                    dx, dy, dist = 1.0, 0.0, 1.0
                push = (MIN_GAP - dist) / 2
                ux, uy = dx / dist, dy / dist
                pa[0] -= ux * push
                pa[1] -= uy * push
                pb[0] += ux * push
                pb[1] += uy * push
                moved = True

        # Clamp every step, not once at the end. Clamping after the fact can
        # push two nodes that were separated into a corner back on top of each
        # other, with no iteration left to notice.
        for point in points.values():
            point[0] = min(max(point[0], 0.0), SCALE_X)
            point[1] = min(max(point[1], 0.0), SCALE_Y)

        if not moved:
            break
