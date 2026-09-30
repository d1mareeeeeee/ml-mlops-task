"""One invocation example; implement the scenario evaluator yourself."""

import json
import os
import sys

import httpx

base = os.getenv("AGENT_URL", "http://localhost:8091")
try:
    response = httpx.post(
        base + "/run",
        headers={"Authorization": "Bearer demo-alice"},
        json={
            "message": "Начисления 10001 за 2026-08",
            "mode": os.getenv("RUN_MODE", "mock"),
        },
        timeout=90,
    )
    print(json.dumps(response.json(), ensure_ascii=False, indent=2))
    sys.exit(0 if response.is_success else 2 if response.status_code == 503 else 1)
except httpx.HTTPError as error:
    print(json.dumps({"status": "BLOCKED", "reason": type(error).__name__}))
    sys.exit(2)
