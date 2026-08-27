"""Generic live-stream relay routes. A producer registers a stream (POST), connects
the ingest WebSocket to push frames, and viewers connect the stream WebSocket (token
gated) or open the watch page. Reusable by crew-bids, regression, and future jobs."""

import json

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from src.live.registry import get_stream, list_streams, register_stream
from src.live.viewer import VIEWER_HTML

router = APIRouter(prefix='/ai/live', tags=['live'])


class RegisterBody(BaseModel):
    kind: str = 'playwright'
    title: str = ''


@router.post('/streams')
def create_stream(body: RegisterBody) -> dict[str, str]:
    """Register a stream; returns its id + token. Any producer may call this."""
    return register_stream(body.kind, body.title)


@router.get('/streams')
def streams() -> dict[str, list]:
    return {'streams': list_streams()}


@router.websocket('/streams/{stream_id}/ingest')
async def ingest(ws: WebSocket, stream_id: str) -> None:
    """Producer → relay. Loopback in practice (the producer is a local subprocess)."""
    hub = get_stream(stream_id)
    if hub is None:
        await ws.close(code=4404)
        return
    await ws.accept()
    try:
        while True:
            hub.publish(await ws.receive_text())
    except WebSocketDisconnect:
        pass
    finally:
        hub.mark_ended()


@router.websocket('/streams/{stream_id}/stream')
async def stream(ws: WebSocket, stream_id: str, token: str = Query(default='')) -> None:
    """Relay → viewer. Token gated. Late joiners get current meta + the latest frame."""
    hub = get_stream(stream_id)
    if hub is None or token != hub.token:
        await ws.close(code=4403)
        return
    await ws.accept()
    q = hub.add_viewer()
    try:
        await ws.send_text(json.dumps(hub.meta()))
        if hub.last_frame is not None:
            await ws.send_text(hub.last_frame)
        if hub.status == 'ended':
            await ws.send_text(json.dumps({'type': 'end'}))
        while True:
            await ws.send_text(await q.get())
    except WebSocketDisconnect:
        pass
    finally:
        hub.remove_viewer(q)


@router.get('/streams/{stream_id}/watch', response_class=HTMLResponse)
def watch(stream_id: str, token: str = Query(default='')) -> HTMLResponse:
    hub = get_stream(stream_id)
    if hub is None:
        raise HTTPException(status_code=404, detail='unknown stream id')
    if token != hub.token:
        raise HTTPException(status_code=403, detail='bad token')
    return HTMLResponse(VIEWER_HTML)
