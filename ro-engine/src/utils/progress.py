import json


def _emit(event: str, **kwargs) -> None:
    print(json.dumps({"event": event, **kwargs}), flush=True)


def progress(phase: str, pct: int, msg: str) -> None:
    _emit("progress", phase=phase, pct=pct, msg=msg)


def done(status: str, msg: str) -> None:
    _emit("done", status=status, pct=100, msg=msg)


def error(code: str, msg: str) -> None:
    _emit("error", code=code, msg=msg)
