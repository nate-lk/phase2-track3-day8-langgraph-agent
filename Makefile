.PHONY: install test lint typecheck run-scenarios run-scenarios-hidden grade-local run-api frontend-install frontend-dev clean

install:
	pip install -e '.[dev]'

test:
	pytest

lint:
	ruff check src tests

typecheck:
	mypy src

run-scenarios:
	python -m langgraph_agent_lab.cli run-scenarios --config configs/lab.yaml --output outputs/metrics.json

run-scenarios-hidden:
	python -m langgraph_agent_lab.cli run-scenarios --config configs/lab_hidden.yaml --output outputs/metrics_hidden.json

grade-local:
	python -m langgraph_agent_lab.cli validate-metrics --metrics outputs/metrics.json

run-api:
	uvicorn langgraph_agent_lab.api_server:app --host 127.0.0.1 --port 8000 --reload

frontend-install:
	cd frontend && npm install

frontend-dev:
	cd frontend && npm run dev

clean:
	rm -rf .pytest_cache .ruff_cache .mypy_cache htmlcov dist build *.egg-info outputs/*.json
