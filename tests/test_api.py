"""HTTP API smoke tests."""

from __future__ import annotations

import importlib.util

import pytest
from fastapi.testclient import TestClient

from langgraph_agent_lab.api.app import AppSettings, create_app

pytestmark = pytest.mark.skipif(
    importlib.util.find_spec("langgraph") is None or importlib.util.find_spec("fastapi") is None,
    reason="langgraph and fastapi required",
)


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app(AppSettings(checkpointer_kind="memory")))


def test_health(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_ticket_simple_completes(client: TestClient) -> None:
    r = client.post("/api/tickets", json={"query": "How do I reset my password?"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "completed"
    assert body["state"]["route"] == "simple"
    assert body["state"].get("final_answer")


def test_ticket_hitl_interrupt_and_resume(client: TestClient) -> None:
    r = client.post(
        "/api/tickets",
        json={"query": "Refund this customer immediately", "use_interrupt": True},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "interrupted"
    thread_id = body["thread_id"]
    assert body["interrupts"]

    r2 = client.post(f"/api/tickets/{thread_id}/resume", json={"approved": True, "comment": "ok"})
    assert r2.status_code == 200
    done = r2.json()
    assert done["status"] == "completed"
    assert done["state"].get("final_answer")


def test_graph_mermaid(client: TestClient) -> None:
    r = client.get("/api/graph/mermaid")
    assert r.status_code == 200
    assert "mermaid" in r.json()
    assert len(r.json()["mermaid"]) > 10


def test_batch_tickets(client: TestClient) -> None:
    r = client.post(
        "/api/tickets/batch",
        json={"queries": ["Refund this customer", "How do I reset my password?", "  ", "\n"]},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["count"] == 2
    assert data["hitl_disabled"] is True
    assert len(data["results"]) == 2
    assert data["errors"] == []
    routes = {row["state"]["route"] for row in data["results"]}
    assert routes == {"risky", "simple"}


def test_batch_tickets_rejects_all_empty(client: TestClient) -> None:
    r = client.post("/api/tickets/batch", json={"queries": ["", "  ", "\n"]})
    assert r.status_code == 400
