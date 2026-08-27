"""Generic in-memory registry of live Playwright streams (process-local, mirrors
the regression/crew-bids run registries). Knows nothing about bids — any producer
registers a stream, pushes frames on the ingest WS, and viewers fan out from here.

A stream carries small JSON messages: {type:'meta'|'page'|'frame'|'end', ...}. The
relay stores the latest frame so a viewer joining mid-run paints immediately, and
broadcasts every message to connected viewer queues (dropping when a viewer lags —
live video tolerates drops; the producing run must never stall)."""

import asyncio
import json
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any

# Bound per-viewer queues so a slow viewer can't grow memory without limit; we keep
# the newest frames and drop the oldest when full.
_VIEWER_QUEUE_MAX = 8


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class StreamHub:
    """One live stream: metadata, the latest frame, and its connected viewers."""

    def __init__(self, kind: str, title: str) -> None:
        self.id = uuid.uuid4().hex[:12]
        self.token = secrets.token_urlsafe(16)
        self.kind = kind or 'playwright'
        self.title = title or ''
        self.status = 'live'
        self.started_at = _now()
        self.current_page = ''
        self.last_frame: str | None = None  # raw 'frame' message text
        self.viewers: set[asyncio.Queue[str]] = set()

    def meta(self) -> dict[str, Any]:
        return {
            'type': 'meta',
            'id': self.id,
            'kind': self.kind,
            'title': self.title,
            'status': self.status,
            'currentPage': self.current_page,
            'viewerCount': len(self.viewers),
            'startedAt': self.started_at,
        }

    def summary(self) -> dict[str, Any]:
        return {
            'id': self.id,
            'kind': self.kind,
            'title': self.title,
            'status': self.status,
            'viewerCount': len(self.viewers),
            'startedAt': self.started_at,
        }

    def add_viewer(self) -> asyncio.Queue[str]:
        q: asyncio.Queue[str] = asyncio.Queue(maxsize=_VIEWER_QUEUE_MAX)
        self.viewers.add(q)
        return q

    def remove_viewer(self, q: asyncio.Queue[str]) -> None:
        self.viewers.discard(q)

    def _fanout(self, message: str) -> None:
        for q in list(self.viewers):
            try:
                q.put_nowait(message)
            except asyncio.QueueFull:
                # Drop the oldest frame, keep the newest — viewers want "now".
                try:
                    q.get_nowait()
                    q.put_nowait(message)
                except Exception:
                    pass

    def publish(self, message: str) -> None:
        """Ingest one producer message: update state, then fan out to viewers."""
        try:
            data = json.loads(message)
        except (json.JSONDecodeError, TypeError):
            data = {}
        kind = data.get('type')
        if kind == 'frame':
            self.last_frame = message
        elif kind == 'page':
            self.current_page = data.get('title') or data.get('url') or ''
        elif kind == 'meta':
            self.kind = data.get('kind', self.kind)
            self.title = data.get('title', self.title)
        elif kind == 'end':
            self.status = 'ended'
        self._fanout(message)

    def mark_ended(self) -> None:
        if self.status != 'ended':
            self.status = 'ended'
        self._fanout(json.dumps({'type': 'end'}))


# ── Registry ────────────────────────────────────────────────────────────────
_streams: dict[str, StreamHub] = {}


def register_stream(kind: str, title: str) -> dict[str, str]:
    """Create a stream; return its id + token (token gates viewers)."""
    hub = StreamHub(kind, title)
    _streams[hub.id] = hub
    return {'id': hub.id, 'token': hub.token}


def get_stream(stream_id: str) -> StreamHub | None:
    return _streams.get(stream_id)


def list_streams() -> list[dict[str, Any]]:
    return [h.summary() for h in _streams.values()]


def _reset_for_tests() -> None:
    _streams.clear()
