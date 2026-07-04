import sys
import os
from fastapi.testclient import TestClient

# ensure project root is importable
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from backend.app.main import app


def main():
    client = TestClient(app)
    r = client.get("/health")
    print("status_code:", r.status_code)
    print("body:", r.json())


if __name__ == "__main__":
    main()
