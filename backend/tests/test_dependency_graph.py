"""Unit tests: dependency graph (DEPENDENCY_GRAPH.md) — structure, validation, scheduling helpers."""

import pytest

from backend.orchestration.graph import (
    DependencyGraph,
    GraphValidationError,
    MISSION_GRAPH,
    NodeSpec,
)


def node(slug, level, **kw):
    return NodeSpec.make(slug, level=level, **kw)


def test_default_graph_has_six_nodes():
    assert set(MISSION_GRAPH.nodes) == {
        "risk_assessment",
        "victim_localization",
        "resource_coordination",
        "knowledge_retrieval",
        "rescue_coordination",
        "briefing_generator",
    }


def test_default_graph_levels():
    # Strict sequential pipeline: one node per level.
    assert MISSION_GRAPH.levels() == [1, 2, 3, 4, 5, 6]
    assert MISSION_GRAPH.nodes_for_level(1) == ["risk_assessment"]
    assert MISSION_GRAPH.nodes_for_level(2) == ["victim_localization"]
    assert MISSION_GRAPH.nodes_for_level(3) == ["resource_coordination"]
    assert MISSION_GRAPH.nodes_for_level(4) == ["knowledge_retrieval"]
    assert MISSION_GRAPH.nodes_for_level(5) == ["rescue_coordination"]
    assert MISSION_GRAPH.nodes_for_level(6) == ["briefing_generator"]


def test_default_graph_edges():
    # Each agent consumes the previous agent's report: a linear chain.
    assert MISSION_GRAPH.edges == (
        ("risk_assessment", "victim_localization"),
        ("victim_localization", "resource_coordination"),
        ("resource_coordination", "knowledge_retrieval"),
        ("knowledge_retrieval", "rescue_coordination"),
        ("rescue_coordination", "briefing_generator"),
    )


def test_dependencies_and_dependents():
    assert MISSION_GRAPH.dependencies("victim_localization") == ("risk_assessment",)
    assert MISSION_GRAPH.dependencies("resource_coordination") == ("victim_localization",)
    assert MISSION_GRAPH.dependencies("knowledge_retrieval") == ("resource_coordination",)
    assert MISSION_GRAPH.dependencies("rescue_coordination") == ("knowledge_retrieval",)
    assert MISSION_GRAPH.dependencies("briefing_generator") == ("rescue_coordination",)
    assert MISSION_GRAPH.dependents("risk_assessment") == ("victim_localization",)
    assert MISSION_GRAPH.dependents("victim_localization") == ("resource_coordination",)


def test_single_sink():
    assert MISSION_GRAPH.sinks() == ("briefing_generator",)
    assert MISSION_GRAPH.is_sink("briefing_generator")
    assert not MISSION_GRAPH.is_sink("risk_assessment")


def test_sources_are_l1():
    # Only the risk agent starts without a predecessor report.
    assert MISSION_GRAPH.sources() == ("risk_assessment",)


def test_topological_order_covers_every_node_and_respects_edges():
    order = MISSION_GRAPH.topological_order()
    assert set(order) == set(MISSION_GRAPH.nodes)
    idx = {n: i for i, n in enumerate(order)}
    for u, v in MISSION_GRAPH.edges:
        assert idx[u] < idx[v]


def test_node_spec_metadata():
    spec = MISSION_GRAPH.node("risk_assessment")
    assert spec.level == 1
    assert spec.stage_token == "risk_assessed"
    assert "evidence" in spec.reads
    assert "risk_report" in spec.writes


def test_validation_rejects_unknown_node():
    nodes = {n.slug: n for n in MISSION_GRAPH.nodes.values()}
    nodes["phantom"] = node("phantom", 2)
    edges = list(MISSION_GRAPH.edges) + [("risk_assessment", "phantom")]
    with pytest.raises(GraphValidationError):
        DependencyGraph(nodes=nodes, edges=edges)


def test_validation_rejects_self_loop():
    nodes = {n.slug: n for n in MISSION_GRAPH.nodes.values()}
    edges = list(MISSION_GRAPH.edges) + [("briefing_generator", "briefing_generator")]
    with pytest.raises(GraphValidationError):
        DependencyGraph(nodes=nodes, edges=edges)


def test_validation_rejects_cycle():
    nodes = {
        "a": node("a", 1),
        "b": node("b", 2),
    }
    edges = [("a", "b"), ("b", "a")]
    with pytest.raises(GraphValidationError):
        DependencyGraph(nodes=nodes, edges=edges)


def test_validation_rejects_multiple_sinks():
    nodes = {
        "a": node("a", 1),
        "b": node("b", 1),
    }
    with pytest.raises(GraphValidationError):
        DependencyGraph(nodes=nodes, edges=[])


def test_validation_rejects_level_that_does_not_increase():
    # An edge pointing to a node at the same (or lower) level is invalid: the derived
    # levels and the declared edges must agree (DEPENDENCY_GRAPH §5).
    nodes = {
        "a": node("a", 1),
        "b": node("b", 1),
    }
    with pytest.raises(GraphValidationError):
        DependencyGraph(nodes=nodes, edges=[("a", "b")])


def test_validation_rejects_unreachable_node():
    nodes = {
        "a": node("a", 1),
        "b": node("b", 2),
        "orphan": node("orphan", 3),
    }
    # b -> orphan adds an edge, but orphan is a second sink; the graph must have a
    # single terminal node. Build a graph where orphan is a disconnected sink.
    nodes["orphan"] = node("orphan", 3)
    with pytest.raises(GraphValidationError):
        DependencyGraph(nodes=nodes, edges=[("a", "b")])


def test_custom_graph_scheduling():
    nodes = {
        "x": node("x", 1, stage_token="x_done"),
        "y": node("y", 1, stage_token="y_done"),
        "z": node("z", 2, stage_token="z_done"),
    }
    graph = DependencyGraph(nodes=nodes, edges=[("x", "z"), ("y", "z")])
    assert graph.levels() == [1, 2]
    assert graph.nodes_for_level(2) == ["z"]
    assert graph.dependencies("z") == ("x", "y")
    assert graph.sinks() == ("z",)
