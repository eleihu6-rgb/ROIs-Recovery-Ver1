"""Scenario management endpoints."""

import logging

import httpx
from fastapi import APIRouter

from src.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/api/po/scenario/{scenario_id}")
async def get_scenario(scenario_id: int):
    """Proxy to live-server to get scenario details + KPIs."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Fetch scenario
            resp = await client.get(
                f"{settings.live_server_url}/api/scenario/{scenario_id}"
            )
            resp.raise_for_status()
            scenario_data = resp.json()

            # Fetch KPIs
            kpi_resp = await client.get(
                f"{settings.live_server_url}/api/scenario/{scenario_id}/kpi"
            )
            kpi_resp.raise_for_status()
            kpi_data = kpi_resp.json()

        scenario = scenario_data.get("data", scenario_data)
        kpis = kpi_data.get("data", kpi_data)

        return {
            "code": 200,
            "data": {"scenario": scenario, "kpis": kpis},
            "message": "ok",
        }
    except httpx.HTTPStatusError as e:
        logger.error("Failed to fetch scenario %d: %s", scenario_id, e)
        return {"code": e.response.status_code, "data": None, "message": str(e)}
    except Exception as e:
        logger.exception("Failed to fetch scenario %d", scenario_id)
        return {"code": 500, "data": None, "message": str(e)}
