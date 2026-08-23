"""The validator is the only thing standing between a typo and a spoiler, so it
gets tested against tables that should fail as well as tables that should pass.
"""

from __future__ import annotations

import pytest

from dcc_pipeline.validate import errors, read_tables, validate

CURATED = None  # read_tables' default: the real data/curated directory


def rows(**overrides):
    """A minimal set of tables that validates clean, with targeted overrides."""
    base = {
        "entities": [
            {
                "id": "carl",
                "type": "character",
                "canonical_name": "Carl",
                "introduced_floor": "0",
                "notes": "",
            },
            {
                "id": "donut",
                "type": "character",
                "canonical_name": "Princess Donut",
                "introduced_floor": "0",
                "notes": "",
            },
            {
                "id": "boots",
                "type": "item",
                "canonical_name": "Protective Boots",
                "introduced_floor": "1",
                "notes": "",
            },
        ],
        "aliases": [],
        "facts": [],
        "status": [],
        "edges": [],
        "mechanics": [],
    }
    base.update(overrides)
    return base


def fact(**overrides):
    row = {
        "id": "f1",
        "subject_id": "carl",
        "predicate": "wields",
        "object": "boots",
        "event_floor": "1",
        "reveal_floor": "1",
        "significance_floor": "1",
        "source": "b1-ch4",
        "confidence": "certain",
        "notes": "",
    }
    row.update(overrides)
    return row


def edge(**overrides):
    row = {
        "src": "carl",
        "dst": "donut",
        "type": "party",
        "event_floor": "0",
        "reveal_floor": "0",
        "ended_event_floor": "",
        "ended_reveal_floor": "",
        "confidence": "certain",
    }
    row.update(overrides)
    return row


def messages(issues):
    return " | ".join(i.message for i in issues)


def test_minimal_tables_validate_clean():
    assert validate(rows()) == []


# --- column checks ---------------------------------------------------------


def test_unknown_enum_value_is_an_error():
    bad = rows(entities=[{**rows()["entities"][0], "type": "sidekick"}])
    assert "not in" in messages(errors(validate(bad)))


def test_unresolved_foreign_key_is_an_error():
    bad = rows(facts=[fact(subject_id="ghost")])
    assert "does not resolve" in messages(errors(validate(bad)))


def test_duplicate_id_is_an_error():
    dupe = rows()["entities"][0]
    assert "duplicate" in messages(errors(validate(rows(entities=[dupe, dupe]))))


def test_missing_required_value_is_an_error():
    assert "required" in messages(errors(validate(rows(facts=[fact(source="")]))))


def test_negative_floor_is_an_error():
    bad = rows(facts=[fact(reveal_floor="-1")])
    assert "below floor 0" in messages(errors(validate(bad)))


# --- clock rules -----------------------------------------------------------


def test_gloss_may_not_land_before_the_claim():
    bad = rows(facts=[fact(reveal_floor="4", significance_floor="2")])
    assert "cannot land before" in messages(errors(validate(bad)))


def test_foreshadowing_without_a_note_is_an_error():
    bad = rows(facts=[fact(event_floor="5", reveal_floor="2", notes="")])
    assert "not a typo" in messages(errors(validate(bad)))


def test_foreshadowing_with_a_note_is_a_warning_not_an_error():
    ok = rows(
        facts=[fact(event_floor="5", reveal_floor="2", significance_floor="2", notes="announced early")]
    )
    issues = validate(ok)
    assert errors(issues) == []
    assert [i.level for i in issues] == ["warning"]


def test_status_may_not_be_foreshadowed():
    bad = rows(
        status=[
            {"entity_id": "carl", "status": "departed", "event_floor": "5", "reveal_floor": "2"}
        ]
    )
    assert "may not be foreshadowed" in messages(errors(validate(bad)))


def test_edge_may_not_end_before_it_is_known():
    bad = rows(edges=[edge(reveal_floor="3", ended_event_floor="1", ended_reveal_floor="1")])
    assert "before it is known to exist" in messages(errors(validate(bad)))


def test_half_ended_edge_is_an_error():
    bad = rows(edges=[edge(ended_reveal_floor="4")])
    assert "both be set or both empty" in messages(errors(validate(bad)))


def test_self_edge_is_an_error():
    assert "same entity" in messages(errors(validate(rows(edges=[edge(dst="carl")]))))


# --- visibility ordering ---------------------------------------------------


@pytest.mark.parametrize(
    "table,row,fragment",
    [
        ("aliases", {"entity_id": "boots", "alias": "The Boots", "reveal_floor": "0"}, "precedes introduced_floor"),
        ("facts", None, "precedes introduced_floor"),
        ("status", {"entity_id": "boots", "status": "active", "event_floor": "0", "reveal_floor": "0"}, "precedes introduced_floor"),
    ],
)
def test_record_may_not_precede_its_subject(table, row, fragment):
    payload = [row] if row else [fact(subject_id="boots", reveal_floor="0", event_floor="0", significance_floor="0")]
    assert fragment in messages(errors(validate(rows(**{table: payload}))))


def test_edge_may_not_precede_either_endpoint():
    bad = rows(edges=[edge(dst="boots", reveal_floor="0")])
    assert "precedes introduced_floor" in messages(errors(validate(bad)))


# --- mechanics -------------------------------------------------------------


def mechanic(**overrides):
    row = {
        "entity_id": "boots",
        "cost_type": "gold",
        "cost_value": "200",
        "effect_category": "defense",
        "effect_scale": "2",
        "duration": "permanent",
        "restrictions": "",
        "introduced_floor": "1",
        "source": "b1-ch9",
        "confidence": "probable",
    }
    row.update(overrides)
    return row


def test_mechanics_row_on_an_unpriceable_entity_is_an_error():
    bad = rows(mechanics=[mechanic(entity_id="carl", introduced_floor="1")])
    assert "carries no price" in messages(errors(validate(bad)))


def test_effect_scale_outside_one_to_five_is_an_error():
    assert "outside 1..5" in messages(errors(validate(rows(mechanics=[mechanic(effect_scale="9")]))))


# --- the real corpus -------------------------------------------------------


def test_curated_corpus_has_no_errors():
    issues = validate(read_tables())
    assert errors(issues) == [], "\n".join(str(i) for i in errors(issues))


def test_fact_object_naming_a_future_entity_is_an_error():
    # 'boots' is introduced on floor 1. A floor 0 fact that names it would show
    # the reader an item that does not exist for them yet.
    bad = rows(
        facts=[fact(subject_id="carl", object="boots", event_floor="0", reveal_floor="0", significance_floor="0")]
    )
    assert "precedes introduced_floor" in messages(errors(validate(bad)))


def test_fact_object_that_is_plain_text_is_left_alone():
    ok = rows(facts=[fact(object="a pair of boots", reveal_floor="0", event_floor="0", significance_floor="0")])
    assert errors(validate(ok)) == []
