import json
import logging
from datetime import date, timedelta
from pathlib import Path

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from config import settings

logger = logging.getLogger(__name__)
STATE_FILE = Path(__file__).parent / ".scheduler_state.json"

_DEFAULT_STATE = {
    "crew": True,
    "flight": True,
    "pairing": True,
    "roster_flight": True,
    "roster_ground": True,
    "manday": True,
}


def _load_state() -> dict[str, bool]:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return dict(_DEFAULT_STATE)


def _save_state(state: dict[str, bool]) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2))


class SchedulerManager:
    def __init__(self) -> None:
        self._scheduler = BackgroundScheduler(timezone="UTC")
        self._state = _load_state()
        self._register_jobs()

    def _register_jobs(self) -> None:
        self._scheduler.add_job(
            self._run_crew, CronTrigger(hour=0, minute=0), id="crew", replace_existing=True
        )
        self._scheduler.add_job(
            self._run_flight, CronTrigger(hour=1, minute=0), id="flight", replace_existing=True
        )
        self._scheduler.add_job(
            self._run_pairing, CronTrigger(hour=1, minute=30), id="pairing", replace_existing=True
        )
        self._scheduler.add_job(
            self._run_roster_flight, CronTrigger(hour=2, minute=0), id="roster_flight", replace_existing=True
        )
        self._scheduler.add_job(
            self._run_roster_ground, CronTrigger(hour=2, minute=30), id="roster_ground", replace_existing=True
        )
        self._scheduler.add_job(
            self._run_manday, CronTrigger(hour=3, minute=0), id="manday", replace_existing=True
        )
        # Pause jobs that were disabled in last session
        for job_name, enabled in self._state.items():
            if not enabled:
                self._scheduler.pause_job(job_name)

    def start(self) -> None:
        self._scheduler.start()

    def shutdown(self) -> None:
        self._scheduler.shutdown(wait=False)

    def enable(self, job_name: str) -> None:
        self._scheduler.resume_job(job_name)
        self._state[job_name] = True
        _save_state(self._state)

    def disable(self, job_name: str) -> None:
        self._scheduler.pause_job(job_name)
        self._state[job_name] = False
        _save_state(self._state)

    def get_status(self) -> dict:
        return {name: enabled for name, enabled in self._state.items()}

    def _default_range(self) -> tuple[str, str]:
        today = date.today()
        return today.isoformat(), (today + timedelta(days=settings.sync_days_ahead)).isoformat()

    def _run_crew(self) -> None:
        if not self._state.get("crew"):
            return
        from f8.crew import sync_crew

        result = sync_crew()
        logger.info("Scheduled crew sync: %s", result.to_dict())

    def _run_flight(self) -> None:
        if not self._state.get("flight"):
            return
        from f8.flight import sync_flight

        start, end = self._default_range()
        result = sync_flight(start, end)
        logger.info("Scheduled flight sync: %s", result.to_dict())

    def _run_pairing(self) -> None:
        if not self._state.get("pairing"):
            return
        from f8.pairing import sync_pairing

        start, end = self._default_range()
        result = sync_pairing(start, end)
        logger.info("Scheduled pairing sync: %s", result.to_dict())

    def _run_roster_flight(self) -> None:
        if not self._state.get("roster_flight"):
            return
        from f8.roster_flight import sync_roster_flight

        start, end = self._default_range()
        result = sync_roster_flight(start, end)
        logger.info("Scheduled roster_flight sync: %s", result.to_dict())

    def _run_roster_ground(self) -> None:
        if not self._state.get("roster_ground"):
            return
        from f8.roster_ground import sync_roster_ground

        start, end = self._default_range()
        result = sync_roster_ground(start, end)
        logger.info("Scheduled roster_ground sync: %s", result.to_dict())

    def _run_manday(self) -> None:
        if not self._state.get("manday"):
            return
        from f8.manday import sync_manday

        start, end = self._default_range()
        result = sync_manday(start, end)
        logger.info("Scheduled manday sync: %s", result.to_dict())


scheduler_manager = SchedulerManager()