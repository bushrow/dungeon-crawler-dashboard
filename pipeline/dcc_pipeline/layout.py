"""Freeze one graph layout over the whole corpus.

The layout runs once, here, over every node and edge regardless of horizon. The
apps render only the horizon-visible subgraph at these fixed coordinates, so a
node appears where it was always going to be and the rest of the graph does not
move when the slider does. Recomputing per floor would make the graph jump on
every tick, which destroys the one thing the view is for.

Fruchterman-Reingold is implemented here in plain Python rather than taken from
networkx. The point is reproducibility: a spring layout is chaotic, so the
floating-point differences between numpy on arm64 and on x64 amplify from 1e-15
into hundreds of units of final position, and the committed bundle then differs
from a CI rebuild for reasons that have nothing to do with the data. Fixed
iteration order over plain IEEE doubles gives the same answer everywhere, and it
drops the last two dependencies in the pipeline.
"""

from __future__ import annotations

import math
import random

#: Node types the Atlas draws. Locations, items, and skills are corpus records,
#: not graph nodes.
GRAPH_TYPES = ("character", "faction")

SEED = 7
ITERATIONS = 400

#: The graph panel is a wide rectangle, so the layout is computed in one. A
#: square layout letterboxes inside the panel and wastes most of its width.
SCALE_X = 1800.0
SCALE_Y = 980.0

#: Minimum gap between two nodes in scaled units. Spring layouts happily stack
#: weakly-connected nodes on top of each other, and a label sits under every
#: node, so a purely force-driven result is unreadable at this corpus size.
MIN_GAP = 200.0
RELAX_STEPS = 300

#: Guards a division by zero when two nodes land exactly on top of each other.
EPSILON = 1e-9


def graph_nodes(entities: list[dict]) -> list[str]:
    return [e["id"] for e in entities if e.get("type") in GRAPH_TYPES]


def _spring(nodes: list[str], edges: list[tuple[str, str]]) -> dict[str, list[float]]:
    """Fruchterman-Reingold on the unit square.

    Deterministic by construction: a seeded Mersenne Twister for the starting
    positions, and every accumulation runs over a sorted, fixed order so the
    floating-point sums are identical on every machine.
    """
    rng = random.Random(SEED)
    pos = {node: [rng.random(), rng.random()] for node in nodes}

    k = math.sqrt(1.0 / len(nodes))
    temperature = 0.1
    cooling = temperature / (ITERATIONS + 1)

    for _ in range(ITERATIONS):
        disp = {node: [0.0, 0.0] for node in nodes}

        for i, a in enumerate(nodes):
            for b in nodes[i + 1 :]:
                dx = pos[a][0] - pos[b][0]
                dy = pos[a][1] - pos[b][1]
                distance = max(math.sqrt(dx * dx + dy * dy), EPSILON)
                force = k * k / distance
                ux, uy = dx / distance, dy / distance
                disp[a][0] += ux * force
                disp[a][1] += uy * force
                disp[b][0] -= ux * force
                disp[b][1] -= uy * force

        for a, b in edges:
            dx = pos[a][0] - pos[b][0]
            dy = pos[a][1] - pos[b][1]
            distance = max(math.sqrt(dx * dx + dy * dy), EPSILON)
            force = distance * distance / k
            ux, uy = dx / distance, dy / distance
            disp[a][0] -= ux * force
            disp[a][1] -= uy * force
            disp[b][0] += ux * force
            disp[b][1] += uy * force

        for node in nodes:
            dx, dy = disp[node]
            length = max(math.sqrt(dx * dx + dy * dy), EPSILON)
            step = min(length, temperature)
            pos[node][0] += dx / length * step
            pos[node][1] += dy / length * step

        temperature -= cooling

    return pos


def compute(entities: list[dict], edges: list[dict]) -> dict[str, dict[str, float]]:
    """Return {entity_id: {"x": int, "y": int}} in a SCALE_X by SCALE_Y box."""
    nodes = sorted(graph_nodes(entities))
    if not nodes:
        return {}

    keep = set(nodes)
    pairs = sorted(
        {
            (edge["src"], edge["dst"])
            for edge in edges
            if edge.get("src") in keep and edge.get("dst") in keep and edge["src"] != edge["dst"]
        }
    )

    raw = _spring(nodes, pairs)

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
            norm(raw[node][0], x_min, x_max, SCALE_X),
            norm(raw[node][1], y_min, y_max, SCALE_Y),
        ]
        for node in nodes
    }
    _relax(scaled)

    # Integers, not decimals. The box is 1800 by 980, so whole units are finer
    # than the renderer can use, and sub-unit precision only records noise.
    return {node: {"x": round(p[0]), "y": round(p[1])} for node, p in scaled.items()}


def _relax(points: dict[str, list[float]]) -> None:
    """Push overlapping nodes apart, in place.

    Deterministic: fixed step count, fixed iteration order, no randomness. Runs
    after scaling so MIN_GAP is expressed in the same units the renderer uses.
    """
    ids = sorted(points)
    for _ in range(RELAX_STEPS):
        moved = False
        for i, a in enumerate(ids):
            for b in ids[i + 1 :]:
                pa, pb = points[a], points[b]
                dx, dy = pb[0] - pa[0], pb[1] - pa[1]
                distance = math.sqrt(dx * dx + dy * dy)
                if distance >= MIN_GAP:
                    continue
                # Two nodes exactly on top of each other have no direction to
                # separate along, so nudge them apart on a fixed axis.
                if distance == 0:
                    dx, dy, distance = 1.0, 0.0, 1.0
                push = (MIN_GAP - distance) / 2
                ux, uy = dx / distance, dy / distance
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
