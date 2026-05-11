"""HTTP API for running the LangGraph lab from a React (or other) client."""

from __future__ import annotations

from .app import create_app

__all__ = ["create_app"]
