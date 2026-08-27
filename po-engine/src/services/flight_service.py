"""Service for fetching flight data from the live-server HTTP API."""

import logging

import httpx

from src.config import settings
from src.models.flight import Flight

logger = logging.getLogger(__name__)


class FlightService:
    """Fetches flights from live-server (port 3000)."""

    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = base_url or settings.live_server_url

    async def get_flights(
        self,
        start_date: str,
        end_date: str,
        fleet: str | None = None,
        page_size: int = 5000,
    ) -> list[Flight]:
        """Fetch all flights in a date range from live-server.

        Uses pagination to handle large datasets.
        GET /api/flight?startDate=...&endDate=...&pageSize=...&page=...

        Response shape:
        {
          "code": 200,
          "data": {
            "items": [ ... ],
            "total": 123,
            "page": 1,
            "pageSize": 5000
          }
        }
        """
        all_flights: list[Flight] = []
        page = 1

        async with httpx.AsyncClient(timeout=60.0) as client:
            while True:
                params: dict[str, str | int] = {
                    "startDate": start_date,
                    "endDate": end_date,
                    "page": page,
                    "pageSize": page_size,
                    "sortBy": "schDepDtUtc",
                    "sortOrder": "asc",
                }
                if fleet:
                    params["fleet"] = fleet

                url = f"{self.base_url}/api/flight"
                logger.info("Fetching flights page %d from %s", page, url)

                resp = await client.get(url, params=params)
                resp.raise_for_status()
                body = resp.json()

                data = body.get("data", body)
                items = data.get("items", data) if isinstance(data, dict) else data
                if isinstance(items, list):
                    for item in items:
                        flight = self._parse_flight(item)
                        if flight is not None:
                            all_flights.append(flight)

                # Check if there are more pages
                total = data.get("total", 0) if isinstance(data, dict) else 0
                if not items or len(all_flights) >= total:
                    break
                page += 1

        logger.info("Fetched %d flights for %s to %s", len(all_flights), start_date, end_date)
        return all_flights

    @staticmethod
    def _parse_flight(raw: dict) -> Flight | None:
        """Parse a raw flight dict from the API into a Flight model.

        Skips deleted or cancelled flights.
        """
        if raw.get("isDeleted", 0) == 1:
            return None
        if raw.get("flightFlag") == "X":
            return None

        return Flight(
            id=raw["id"],
            airline=raw.get("airline", ""),
            flt_dt=raw.get("fltDt", ""),
            flt_num=raw.get("fltNum", ""),
            dep_arp=raw.get("depArp", ""),
            arv_arp=raw.get("arvArp", ""),
            sch_dep_dt_utc=raw["schDepDtUtc"],
            sch_arv_dt_utc=raw["schArvDtUtc"],
            blk_min=raw.get("blkMin", 0),
            fleet=raw.get("fleet", ""),
            flt_type=raw.get("fltType", "J"),
            seg_type=raw.get("segType"),
            is_locked=raw.get("isLocked", 0),
        )
