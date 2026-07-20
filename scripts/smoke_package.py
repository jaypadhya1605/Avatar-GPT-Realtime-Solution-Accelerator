from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: smoke_package.py <package-root>")

    package_root = Path(sys.argv[1]).resolve()
    if not (package_root / "app" / "main.py").is_file():
        raise SystemExit(f"Packaged backend not found at {package_root}")

    os.environ.update(
        {
            "APP_ENV": "test",
            "APP_MODE": "mock",
            "BUILD_LABEL": "package-smoke",
            "FRONTEND_DIST_PATH": "frontend/dist",
            "PERSIST_RESULTS": "false",
        }
    )
    sys.path.insert(0, str(package_root))

    from app.main import app

    with TestClient(app) as client:
        for path in ("/healthz", "/readyz"):
            response = client.get(path)
            assert response.status_code == 200, (path, response.text)

        config = client.get("/api/config")
        assert config.status_code == 200, config.text
        assert config.json()["mode"] == "mock"

        scenarios = client.get("/api/scenarios")
        assert scenarios.status_code == 200, scenarios.text
        assert len(scenarios.json()) == 3

        index = client.get("/")
        assert index.status_code == 200, index.text
        assert "text/html" in index.headers.get("content-type", "")

    print("Package smoke checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
