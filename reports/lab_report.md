---
Filled from `reports/lab_report_template.md` using the implementation under `src/langgraph_agent_lab/` and metrics from `outputs/metrics.json`. Add your name in section 1. If your rubric requires the exact path `reports/lab_report.md`, copy or rename this file to match.
---

# Day 08 Lab Report

## 1. Team / student

- Name: Khuong Hai Lam
- Repo/commit: https://github.com/nate-lk/phase2-track3-day8-langgraph-agent.git
- Date: 2026-05-11

## 2. Architecture

The workflow is a **StateGraph** over `AgentState` with a **memory** checkpointer for scenario runs (`configs/lab.yaml`). Linear and conditional edges implement the lab’s ticket flow:

- **START → intake → classify** — normalize the query and append audit messages/events.
- **classify → (conditional)** — `route_after_classify` sends **simple** to `answer`, **tool** to `tool`, **missing_info** to `clarify`, **risky** to `risky_action`, **error** to `retry`.
- **Tool path** — `tool → evaluate →` either `answer` (success) or `retry` (needs_retry). `retry` increments `attempt` and loops back to `tool` until `attempt >= max_attempts`, then `dead_letter → finalize → END`.
- **Risky path** — `risky_action → approval →` (if approved) `tool → evaluate → …` else `clarify → finalize`.
- **Simple / clarify / dead_letter** — converge on `finalize → END`.

Routing in `classify_node` uses **keyword priority**: risky (e.g. refund, delete, send) before tool (status, order, lookup), then short vague queries with whole-word **it** for missing_info, then error signals (timeout, fail), else **simple**. This matches the sample scenarios without matching scenario IDs.

## 3. State schema

Important fields and reducers (see `src/langgraph_agent_lab/state.py`):

| Field | Reducer | Why |
|---|---|---|
| `messages` | append (`add`) | Conversation / intake audit trail |
| `tool_results` | append | Multiple tool calls across retries |
| `errors` | append | Retry error history |
| `events` | append | Structured grading and debugging events |
| `route` | overwrite | Single current classification |
| `risk_level` | overwrite | Latest risk assessment |
| `attempt` | overwrite | Bounded retry counter |
| `max_attempts` | overwrite | Per-scenario cap (e.g. S07 uses 1) |
| `evaluation_result` | overwrite | Latest “done?” gate (`success` / `needs_retry`) |
| `final_answer` | overwrite | Terminal user-facing output |
| `pending_question` | overwrite | Clarification when information is missing |
| `proposed_action` | overwrite | Risky path payload for approval |
| `approval` | overwrite | Serialized `ApprovalDecision` after approval node |
| `thread_id`, `scenario_id`, `query` | overwrite | Run identity and input |
| `use_interrupt` | optional overwrite | API flag to use `interrupt()` in approval |

## 4. Scenario results

Summary from `outputs/metrics.json` (regenerate with `make run-scenarios`):

- **total_scenarios:** 7  
- **success_rate:** 1.0  
- **avg_nodes_visited:** ~6.43  
- **total_retries:** 3  
- **total_interrupts:** 2 *(metric counts visits to the approval node in the summarizer; not LangGraph interrupt count)*  
- **resume_success:** false *(not exercised in batch CLI metrics)*  

| Scenario | Expected route | Actual route | Success | Retries | Interrupts |
|---|---|---|:---:|:---:|:---:|
| S01_simple | simple | simple | yes | 0 | 0 |
| S02_tool | tool | tool | yes | 0 | 0 |
| S03_missing | missing_info | missing_info | yes | 0 | 0 |
| S04_risky | risky | risky | yes | 0 | 1 |
| S05_error | error | error | yes | 2 | 0 |
| S06_delete | risky | risky | yes | 0 | 1 |
| S07_dead_letter | error | error | yes | 1 | 0 |

## 5. Failure analysis

1. **Retry or tool failure:** On the **error** route, `tool_node` deliberately returns results containing `ERROR` for early attempts; `evaluate_node` sets `evaluation_result` to `needs_retry`, routing to `retry_or_fallback_node`, which bumps `attempt` and records an error string. After enough attempts, `route_after_retry` routes to **dead_letter** with a human-review message (S07 with `max_attempts: 1` hits this quickly).

2. **Risky action without approval:** The **risky** path always goes through **approval** before continuing to tools. If approval rejects (`approved=False`), `route_after_approval` sends the run to **clarify** instead of `tool`, avoiding execution of the sensitive action without a positive decision. With `LANGGRAPH_INTERRUPT=true` or `use_interrupt` in the API, `approval_node` uses LangGraph **`interrupt()`** so a human must **resume** with a decision (exposed via `POST /api/tickets/{thread_id}/resume`).

## 6. Persistence / recovery evidence

- **Scenario runner:** `build_checkpointer("memory")` with `MemorySaver()`; each invoke uses `configurable.thread_id` set from `initial_state` (`thread-{scenario_id}`) so runs are logically isolated when a checkpointer is present.
- **API:** `LAB_CHECKPOINTER` defaults to **memory**; optional **SQLite** via `pip install -e '.[sqlite]'`, `LAB_CHECKPOINTER=sqlite`, and `LAB_DATABASE_URL` (WAL-enabled connection in `persistence.py`). Tickets get a stable `thread_id` for resume after interrupt.
- **Recovery:** HITL flows use the same compiled graph and checkpointer: after `interrupt()`, the client calls **resume** with an approval payload so execution continues from the checkpoint.

## 7. Extension work

Beyond the core graph and metrics pipeline:

- **FastAPI service** — health, Mermaid graph export, single-ticket create, **batch** ticket run (`POST /api/tickets/batch`, up to 100 lines, `use_interrupt` forced off per row so runs complete without resume).
- **React frontend** — ITSM-style **bento** layout, glass styling, shadcn-style primitives, **light/dark** theme persisted in `localStorage`, navbar with **Single ticket** vs **Batch run** tabs.
- **Persistence options** — `memory`, `sqlite`, stub `postgres` branch in `build_checkpointer`.
- **Ops** — `Makefile` targets (`run-api`, `frontend-dev`, etc.), **Docker** API image and **docker-compose** service, CI including frontend build, **pytest** coverage for API including batch behavior.

## 8. Improvement plan

If there were one more day, the first production-oriented steps would be: **(1)** wire **OpenTelemetry** (or LangSmith) tracing from FastAPI through graph nodes; **(2)** persist **batch** results and idempotent **job ids** for replay; **(3)** tighten **approval** UX with timeouts, audit who resumed, and optional **Postgres** checkpointer for multi-instance API; **(4)** replace keyword routing with a **small classifier model** or tool-calling policy while keeping the same route contract for grading.
