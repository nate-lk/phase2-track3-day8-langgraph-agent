"""FastAPI app: run tickets through the compiled LangGraph and resume HITL interrupts."""

from __future__ import annotations

import os
import uuid
from typing import Annotated, Any

from fastapi import Body, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from langgraph_agent_lab.graph import build_graph
from langgraph_agent_lab.persistence import build_checkpointer
from langgraph_agent_lab.state import ticket_initial_state


class TicketCreate(BaseModel):
    query: str = Field(min_length=1)
    thread_id: str | None = None
    max_attempts: int = Field(default=3, ge=1, le=20)
    use_interrupt: bool = Field(
        default=False,
        description=(
            "If true, approval uses LangGraph interrupt() for HITL (requires a checkpointer)."
        ),
    )


class BatchTicketCreate(BaseModel):
    """Run many ad-hoc queries in one request.

    HITL interrupt is always off so each line can finish without resume.
    """

    queries: list[str] = Field(min_length=1, max_length=100)
    max_attempts: int = Field(default=3, ge=1, le=20)


class ResumeBody(BaseModel):
    approved: bool
    reviewer: str = "web-ui"
    comment: str = ""


class AppSettings(BaseModel):
    checkpointer_kind: str = "memory"
    database_url: str | None = None


def _parse_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173")
    return [o.strip() for o in raw.split(",") if o.strip()]


def _coerce_invoke_result(result: object) -> dict[str, Any]:
    """Normalize LangGraph v1 dict or v2 GraphOutput into a plain dict."""
    if isinstance(result, dict):
        return result
    merged: dict[str, Any] = {}
    value = getattr(result, "value", None)
    if isinstance(value, dict):
        merged.update(value)
    interrupts = getattr(result, "interrupts", None)
    if interrupts:
        merged["__interrupt__"] = list(interrupts)
    return merged


def _serialize_interrupts(raw: object) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    if not raw or not isinstance(raw, (list, tuple)):
        return out
    for item in raw:
        if isinstance(item, dict):
            out.append(item)
            continue
        out.append(
            {
                "id": getattr(item, "id", None),
                "value": getattr(item, "value", item),
            }
        )
    return out


def _public_state_view(state: dict[str, Any]) -> dict[str, Any]:
    """JSON-serializable subset for the UI."""
    keys = (
        "thread_id",
        "scenario_id",
        "query",
        "route",
        "risk_level",
        "attempt",
        "max_attempts",
        "final_answer",
        "pending_question",
        "proposed_action",
        "approval",
        "evaluation_result",
        "messages",
        "tool_results",
        "errors",
        "events",
    )
    return {k: state[k] for k in keys if k in state}


def _invoke_graph(graph: object, payload: object, config: dict[str, Any]) -> dict[str, Any]:
    try:
        result = graph.invoke(payload, config=config, version="v2")  # type: ignore[attr-defined]
    except TypeError:
        result = graph.invoke(payload, config=config)  # type: ignore[attr-defined]
    return _coerce_invoke_result(result)


def _merge_snapshot(
    graph: object, config: dict[str, Any], result: dict[str, Any]
) -> dict[str, Any]:
    """Ensure public fields exist when the runtime returns interrupts without full state in-band."""
    if result.get("query"):
        return result
    try:
        snap = graph.get_state(config)  # type: ignore[attr-defined]
        values = getattr(snap, "values", None)
        if isinstance(values, dict):
            return {**values, **result}
    except Exception:  # pragma: no cover
        pass
    return result


def _run_ticket(
    graph: object,
    checkpointer: Any,
    *,
    query: str,
    thread_id: str,
    max_attempts: int,
    use_interrupt: bool,
) -> dict[str, Any]:
    """Execute one ticket and return the same payload shape as POST /api/tickets."""
    if use_interrupt and checkpointer is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "use_interrupt requires a checkpointer "
                "(set LAB_CHECKPOINTER to memory or sqlite)."
            ),
        )
    state = ticket_initial_state(
        query.strip(),
        thread_id,
        max_attempts=max_attempts,
        use_interrupt=use_interrupt,
    )
    config = {"configurable": {"thread_id": thread_id}}
    result = _invoke_graph(graph, dict(state), config)
    interrupts = result.get("__interrupt__")
    if interrupts:
        result = _merge_snapshot(graph, config, result)
        return {
            "status": "interrupted",
            "thread_id": thread_id,
            "interrupts": _serialize_interrupts(interrupts),
            "state": _public_state_view(result),
        }
    return {
        "status": "completed",
        "thread_id": thread_id,
        "state": _public_state_view(result),
    }


def create_app(settings: AppSettings | None = None) -> FastAPI:
    settings = settings or AppSettings(
        checkpointer_kind=os.getenv("LAB_CHECKPOINTER", "memory"),
        database_url=os.getenv("LAB_DATABASE_URL"),
    )

    checkpointer = build_checkpointer(settings.checkpointer_kind, settings.database_url)
    graph = build_graph(checkpointer=checkpointer)

    app = FastAPI(title="LangGraph Agent Lab API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_parse_cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "checkpointer": settings.checkpointer_kind}

    @app.get("/api/graph/mermaid")
    def graph_mermaid() -> dict[str, str]:
        try:
            mermaid = graph.get_graph().draw_mermaid()
        except Exception as exc:  # pragma: no cover - graph draw edge cases
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        return {"mermaid": mermaid}

    @app.post("/api/tickets")
    def create_ticket(body: Annotated[TicketCreate, Body()]) -> dict[str, Any]:
        thread_id = body.thread_id or f"web-{uuid.uuid4().hex}"
        return _run_ticket(
            graph,
            checkpointer,
            query=body.query,
            thread_id=thread_id,
            max_attempts=body.max_attempts,
            use_interrupt=body.use_interrupt,
        )

    @app.post("/api/tickets/batch")
    def create_tickets_batch(body: Annotated[BatchTicketCreate, Body()]) -> dict[str, Any]:
        """Run each non-empty line; HITL interrupt stays off so every row can finish."""
        lines = [q.strip() for q in body.queries if isinstance(q, str) and q.strip()]
        if not lines:
            raise HTTPException(
                status_code=400,
                detail="Provide at least one non-empty query line.",
            )
        if len(lines) > 100:
            raise HTTPException(status_code=400, detail="Maximum 100 queries per batch.")

        results: list[dict[str, Any]] = []
        errors: list[dict[str, Any]] = []
        for index, query in enumerate(lines):
            thread_id = f"web-{uuid.uuid4().hex}"
            try:
                results.append(
                    {
                        "index": index,
                        "query": query,
                        **_run_ticket(
                            graph,
                            checkpointer,
                            query=query,
                            thread_id=thread_id,
                            max_attempts=body.max_attempts,
                            use_interrupt=False,
                        ),
                    }
                )
            except HTTPException as exc:
                errors.append({"index": index, "query": query, "detail": str(exc.detail)})
            except Exception as exc:  # pragma: no cover
                errors.append({"index": index, "query": query, "detail": str(exc)})

        return {
            "count": len(results),
            "hitl_disabled": True,
            "results": results,
            "errors": errors,
        }

    @app.post("/api/tickets/{thread_id}/resume")
    def resume_ticket(
        thread_id: str,
        body: Annotated[ResumeBody, Body()],
    ) -> dict[str, Any]:
        try:
            from langgraph.types import Command
        except ImportError as exc:  # pragma: no cover
            raise HTTPException(status_code=500, detail="langgraph.types.Command missing") from exc

        if checkpointer is None:
            raise HTTPException(status_code=400, detail="Resume requires a compiled checkpointer.")

        config = {"configurable": {"thread_id": thread_id}}
        resume_payload: dict[str, Any] = {
            "approved": body.approved,
            "reviewer": body.reviewer,
            "comment": body.comment,
        }

        result = _invoke_graph(graph, Command(resume=resume_payload), config)
        interrupts = result.get("__interrupt__")
        if interrupts:
            result = _merge_snapshot(graph, config, result)
            return {
                "status": "interrupted",
                "thread_id": thread_id,
                "interrupts": _serialize_interrupts(interrupts),
                "state": _public_state_view(result),
            }
        return {
            "status": "completed",
            "thread_id": thread_id,
            "state": _public_state_view(result),
        }

    return app
