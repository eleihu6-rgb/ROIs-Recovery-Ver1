import logging
from datetime import date, timedelta

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from config import settings
from f8.crew import sync_crew
from f8.flight import sync_flight
from f8.pairing import sync_pairing
from f8.roster_flight import sync_roster_flight
from f8.roster_ground import sync_roster_ground
from f8.manday import sync_manday

router = APIRouter(prefix="/sync", tags=["sync"])
logger = logging.getLogger(__name__)


class SyncRangeRequest(BaseModel):
    start: str  # yyyy-MM-dd
    end: str


def _default_range() -> tuple[str, str]:
    today = date.today()
    return today.isoformat(), (today + timedelta(days=settings.sync_days_ahead)).isoformat()


@router.post("/crew")
async def trigger_crew_sync(background_tasks: BackgroundTasks):
    background_tasks.add_task(_run_crew)
    return {"status": "started", "entity": "crew"}


@router.post("/flight")
async def trigger_flight_sync(body: SyncRangeRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(_run_flight, body.start, body.end)
    return {"status": "started", "entity": "flight", "range": f"{body.start}~{body.end}"}


@router.post("/pairing")
async def trigger_pairing_sync(body: SyncRangeRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(_run_pairing, body.start, body.end)
    return {"status": "started", "entity": "pairing", "range": f"{body.start}~{body.end}"}


@router.post("/roster-flight")
async def trigger_roster_flight_sync(body: SyncRangeRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(_run_roster_flight, body.start, body.end)
    return {"status": "started", "entity": "roster_flight", "range": f"{body.start}~{body.end}"}


@router.post("/roster-ground")
async def trigger_roster_ground_sync(body: SyncRangeRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(_run_roster_ground, body.start, body.end)
    return {"status": "started", "entity": "roster_ground", "range": f"{body.start}~{body.end}"}


@router.post("/manday")
async def trigger_manday_sync(body: SyncRangeRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(_run_manday, body.start, body.end)
    return {"status": "started", "entity": "manday", "range": f"{body.start}~{body.end}"}


def _run_crew() -> None:
    result = sync_crew()
    logger.info("Crew sync done: %s", result.to_dict())


def _run_flight(start: str, end: str) -> None:
    result = sync_flight(start, end)
    logger.info("Flight sync done: %s", result.to_dict())


def _run_pairing(start: str, end: str) -> None:
    result = sync_pairing(start, end)
    logger.info("Pairing sync done: %s", result.to_dict())


def _run_roster_flight(start: str, end: str) -> None:
    result = sync_roster_flight(start, end)
    logger.info("RosterFlight sync done: %s", result.to_dict())


def _run_roster_ground(start: str, end: str) -> None:
    result = sync_roster_ground(start, end)
    logger.info("RosterGround sync done: %s", result.to_dict())


def _run_manday(start: str, end: str) -> None:
    result = sync_manday(start, end)
    logger.info("Manday sync done: %s", result.to_dict())