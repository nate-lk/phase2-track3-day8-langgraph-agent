"""ASGI entrypoint for `uvicorn langgraph_agent_lab.api_server:app`."""

from __future__ import annotations

from langgraph_agent_lab.api import create_app

app = create_app()


def main() -> None:
    import os

    import uvicorn

    uvicorn.run(
        app,
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("UVICORN_RELOAD", "").lower() == "true",
    )


if __name__ == "__main__":
    main()
