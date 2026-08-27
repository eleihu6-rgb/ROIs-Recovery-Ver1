"""Crew-bid simulation status route. The run itself is started from the chat route
(when R'Bot calls create_crew_bids); this endpoint lets the UI poll its progress."""

from fastapi import APIRouter, HTTPException

from src.crewbids.runner import get_run

router = APIRouter(prefix='/ai/crew-bids', tags=['crew-bids'])


@router.get('/runs/{run_id}')
def run_status(run_id: str) -> dict:
    run = get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail='unknown run id')
    return run
