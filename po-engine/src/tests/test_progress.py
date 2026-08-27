import json
import sys
from io import StringIO
import pytest
from src.utils.progress import progress, done, error


def _capture(fn, *args, **kwargs) -> dict:
    buf = StringIO()
    old = sys.stdout
    sys.stdout = buf
    try:
        fn(*args, **kwargs)
    finally:
        sys.stdout = old
    return json.loads(buf.getvalue().strip())


def test_progress_event():
    ev = _capture(progress, "loading", 5, "Loaded 10 flights")
    assert ev == {"event": "progress", "phase": "loading", "pct": 5, "msg": "Loaded 10 flights"}


def test_done_event():
    ev = _capture(done, "DONE", "Complete: 3 pairings")
    assert ev == {"event": "done", "status": "DONE", "pct": 100, "msg": "Complete: 3 pairings"}


def test_error_event():
    ev = _capture(error, "NO_FLIGHTS", "No flights in input")
    assert ev == {"event": "error", "code": "NO_FLIGHTS", "msg": "No flights in input"}
