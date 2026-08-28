"""Layout and compile.

The layout must be deterministic, because non-deterministic coordinates would
churn the bundle on every recompile and make a real layout change invisible in
review.
"""

from __future__ import annotations

import json

import pytest

from dcc_pipeline import BUNDLE_VERSION, MAX_FLOOR
from dcc_pipeline.compile import build
from dcc_pipeline.layout import GRAPH_TYPES, compute
from dcc_pipeline.validate import read_tables

ENTITIES = [
    {"id": "a", "type": "character", "canonical_name": "A", "introduced_floor": "0", "notes": ""},
    {"id": "b", "type": "character", "canonical_name": "B", "introduced_floor": "1", "notes": ""},
    {"id": "f", "type": "faction", "canonical_name": "F", "introduced_floor": "1", "notes": ""},
    {"id": "sword", "type": "item", "canonical_name": "Sword", "introduced_floor": "1", "notes": ""},
]
EDGES = [{"src": "a", "dst": "b", "type": "party"}, {"src": "b", "dst": "sword", "type": "party"}]


def test_layout_covers_only_connected_graph_types():
    laid_out = compute(ENTITIES, EDGES)
    assert set(laid_out) == {"a", "b"}
    assert "sword" not in laid_out, "items are corpus records, not graph nodes"
    assert set(GRAPH_TYPES) == {"character", "faction"}


def test_layout_is_deterministic():
    assert compute(ENTITIES, EDGES) == compute(ENTITIES, EDGES)


def test_layout_omits_nodes_with_no_relationship():
    # 'f' has no edges anywhere in the corpus. Giving it a position would
    # scatter an isolated dot across the canvas and stretch the layout away
    # from the graph that actually exists. The Atlas says how many it omits.
    assert "f" not in compute(ENTITIES, EDGES)


def test_layout_fits_the_viewbox():
    from dcc_pipeline.layout import extent

    laid_out = compute(ENTITIES, EDGES)
    width, height = extent(len(laid_out))
    for point in laid_out.values():
        assert 0 <= point["x"] <= width
        assert 0 <= point["y"] <= height


def test_extent_grows_with_the_node_count():
    from dcc_pipeline.layout import extent

    small = extent(10)
    large = extent(200)
    assert large[0] > small[0] and large[1] > small[1]
    # A fixed box stops fitting once MIN_GAP times the count exceeds its area.
    assert large[0] / large[1] == pytest.approx(small[0] / small[1], rel=1e-2)


def test_layout_of_empty_corpus_is_empty():
    assert compute([], []) == {}


def test_bundle_carries_version_and_max_floor():
    bundle = build(read_tables())
    assert bundle["version"] == BUNDLE_VERSION
    assert bundle["maxFloor"] == MAX_FLOOR


def test_bundle_converts_floors_to_integers_and_blanks_to_null():
    bundle = build(read_tables())
    for edge in bundle["edges"]:
        assert isinstance(edge["revealFloor"], int)
        assert edge["endedRevealFloor"] is None or isinstance(edge["endedRevealFloor"], int)


def test_bundle_is_json_serialisable_and_stable():
    first = json.dumps(build(read_tables()), sort_keys=True)
    second = json.dumps(build(read_tables()), sort_keys=True)
    assert first == second


def test_every_connected_graph_entity_has_coordinates():
    rows = read_tables()
    bundle = build(rows)
    graph = {e["id"] for e in rows["entities"] if e["type"] in GRAPH_TYPES}
    connected = {
        end
        for edge in rows["edges"]
        for end in (edge["src"], edge["dst"])
        if edge["src"] in graph and edge["dst"] in graph
    }
    assert set(bundle["layout"]) == connected


def test_bundle_reports_the_layout_extent():
    bundle = build(read_tables())
    box = bundle["layoutExtent"]
    for point in bundle["layout"].values():
        assert 0 <= point["x"] <= box["width"]
        assert 0 <= point["y"] <= box["height"]


def _min_gap(laid_out):
    points = list(laid_out.values())
    return min(
        ((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2) ** 0.5
        for i, a in enumerate(points)
        for b in points[i + 1 :]
    )


def test_relaxation_separates_overlapping_nodes():
    from dcc_pipeline.layout import MIN_GAP

    # Rounding to two decimals can shave a hair off the target gap.
    assert _min_gap(compute(ENTITIES, EDGES)) >= MIN_GAP - 1


def test_real_corpus_has_no_overlapping_nodes():
    from dcc_pipeline.layout import MIN_GAP

    rows = read_tables()
    assert _min_gap(compute(rows["entities"], rows["edges"])) >= MIN_GAP - 1


# --- drift detection -------------------------------------------------------


def test_verify_accepts_a_bundle_built_from_the_same_tables():
    from dcc_pipeline.verify import differences

    bundle = build(read_tables())
    assert differences(bundle, bundle) == []


def test_verify_tolerates_sub_unit_layout_drift():
    from dcc_pipeline.verify import TOLERANCE, differences

    bundle = build(read_tables())
    nudged = json.loads(json.dumps(bundle))
    for point in nudged["layout"].values():
        point["x"] += TOLERANCE
    # Different architectures land a hair apart. That is not stale data.
    assert differences(nudged, bundle) == []


def test_verify_rejects_a_node_that_actually_moved():
    from dcc_pipeline.verify import TOLERANCE, differences

    bundle = build(read_tables())
    moved = json.loads(json.dumps(bundle))
    node = sorted(moved["layout"])[0]
    moved["layout"][node]["x"] += TOLERANCE + 50
    assert any("moved by" in d for d in differences(moved, bundle))


def test_verify_rejects_stale_records():
    from dcc_pipeline.verify import differences

    bundle = build(read_tables())
    stale = json.loads(json.dumps(bundle))
    stale["entities"] = stale["entities"][:-1]
    assert any("entities differs" in d for d in differences(stale, bundle))


def test_verify_rejects_a_layout_missing_an_entity():
    from dcc_pipeline.verify import differences

    bundle = build(read_tables())
    stale = json.loads(json.dumps(bundle))
    del stale["layout"][sorted(stale["layout"])[0]]
    assert any("missing" in d for d in differences(stale, bundle))
