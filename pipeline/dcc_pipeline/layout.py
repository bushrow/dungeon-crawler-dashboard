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
SCALE = 1000.0


def graph_nodes(entities: list[dict]) -> list[str]:
    return [e["id"] for e in entities if e.get("type") in GRAPH_TYPES]


def compute(entities: list[dict], edges: list[dict]) -> dict[str, dict[str, float]]:
    """Return {entity_id: {"x": float, "y": float}} in a 0..1000 square."""
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
    raw = nx.spring_layout(g, seed=SEED, iterations=400, k=None)

    xs = [p[0] for p in raw.values()]
    ys = [p[1] for p in raw.values()]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)

    def norm(value: float, low: float, high: float) -> float:
        span = high - low
        # A single node, or a degenerate axis, lands in the middle.
        return SCALE / 2 if span == 0 else round((value - low) / span * SCALE, 2)

    return {
        node: {"x": norm(float(p[0]), x_min, x_max), "y": norm(float(p[1]), y_min, y_max)}
        for node, p in sorted(raw.items())
    }
