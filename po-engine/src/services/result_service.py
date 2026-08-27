"""Service for saving optimization results back to live-server."""

import logging
from datetime import datetime, timezone

import httpx

from src.config import settings
from src.models.pairing import Pairing, PairingDuty, PairingSegment

logger = logging.getLogger(__name__)


class ResultService:
    """Saves pairings and scenario data to live-server (port 3000)."""

    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = base_url or settings.live_server_url

    async def create_scenario(
        self,
        workset_id: int,
        start_date: str,
        end_date: str,
        rule_group_code: str,
        status: str = "RUNNING",
    ) -> int:
        """Create a new scenario in live-server. Returns the scenario ID."""
        url = f"{self.base_url}/api/scenario"
        payload = {
            "worksetId": workset_id,
            "name": f"PO-{start_date}-{end_date}",
            "status": status,
            "strDtLoc": f"{start_date}T00:00:00Z",
            "endDtLoc": f"{end_date}T23:59:59Z",
            "rulesetId": rule_group_code,
            "cqfsetId": "",
            "fileType": "PO",
            "filterParams": {},
            "username": "po-engine",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            body = resp.json()

        data = body.get("data", body)
        scenario_id = data["id"]
        logger.info("Created scenario %d", scenario_id)
        return scenario_id

    async def update_scenario_status(
        self, scenario_id: int, status: str
    ) -> None:
        """Update the status of an existing scenario."""
        url = f"{self.base_url}/api/scenario/{scenario_id}/transition"
        payload = {"status": status, "username": "po-engine"}

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()

        logger.info("Updated scenario %d status to %s", scenario_id, status)

    async def save_pairings(
        self, pairings: list[Pairing], scenario_id: int | None = None
    ) -> list[int]:
        """Save pairings to live-server. Returns list of created pairing IDs."""
        url = f"{self.base_url}/api/pairing"
        pairing_ids: list[int] = []

        async with httpx.AsyncClient(timeout=120.0) as client:
            for i, pairing in enumerate(pairings):
                payload = self._pairing_to_payload(pairing, i + 1)
                payload["username"] = "po-engine"
                payload["source"] = "PO"

                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                body = resp.json()

                data = body.get("data", body)
                pairing_ids.append(data["id"])

        logger.info("Saved %d pairings", len(pairing_ids))
        return pairing_ids

    async def save_kpis(
        self,
        scenario_id: int,
        kpis: dict[str, str],
    ) -> None:
        """Save KPI records for a scenario."""
        url = f"{self.base_url}/api/scenario/{scenario_id}/kpi"

        async with httpx.AsyncClient(timeout=30.0) as client:
            for idx, (name, value) in enumerate(kpis.items()):
                payload = {
                    "kpiNames": name,
                    "kpiValues": str(value),
                    "idx": idx,
                    "type": "PO",
                    "username": "po-engine",
                }
                resp = await client.post(url, json=payload)
                resp.raise_for_status()

        logger.info("Saved %d KPIs for scenario %d", len(kpis), scenario_id)

    @staticmethod
    def _pairing_to_payload(pairing: Pairing, seq: int) -> dict:
        """Convert a Pairing model to the live-server POST /api/pairing payload."""
        now_utc = datetime.now(timezone.utc).isoformat()

        # Build flat segment rows (pairing_segment table has duty info inlined)
        segments_payload: list[dict] = []
        for duty in pairing.duties:
            for seg in duty.segments:
                segments_payload.append({
                    "dutySeq": duty.duty_seq,
                    "dutyStrArp": duty.duty_str_arp,
                    "dutyEndArp": duty.duty_end_arp,
                    "dutySchStrDtUtc": duty.duty_sch_str_dt_utc.isoformat(),
                    "dutySchEndDtUtc": duty.duty_sch_end_dt_utc.isoformat(),
                    "dutyActStrDtUtc": duty.duty_sch_str_dt_utc.isoformat(),
                    "dutyActEndDtUtc": duty.duty_sch_end_dt_utc.isoformat(),
                    "dutyBriefMin": duty.duty_brief_min,
                    "dutyDebriefMin": duty.duty_debrief_min,
                    "dutySchDutyMin": duty.duty_sch_duty_min,
                    "dutySchFdpMin": duty.duty_sch_fdp_min,
                    "dutySchFltMin": duty.duty_sch_flt_min,
                    "dutySchRestMin": duty.duty_sch_rest_min,
                    "dutyAccState": "D",
                    "segSeq": seg.seg_seq,
                    "fltId": seg.flt_id,
                    "fltDt": seg.flt_dt,
                    "fltNum": seg.flt_num,
                    "airline": seg.airline,
                    "depArp": seg.dep_arp,
                    "arvArp": seg.arv_arp,
                    "fleetSeg": seg.fleet_seg,
                    "schStrDtUtc": seg.sch_str_dt_utc.isoformat(),
                    "schEndDtUtc": seg.sch_end_dt_utc.isoformat(),
                    "actStrDtUtc": seg.sch_str_dt_utc.isoformat(),
                    "actEndDtUtc": seg.sch_end_dt_utc.isoformat(),
                    "segAssignment": seg.seg_assignment,
                    # Placeholder timestamps for pickup/brief/debrief/dropoff
                    "pickup1StartUtc": duty.duty_sch_str_dt_utc.isoformat(),
                    "pickup1EndUtc": duty.duty_sch_str_dt_utc.isoformat(),
                    "brief1Airport": duty.duty_str_arp,
                    "brief1StartUtc": duty.duty_sch_str_dt_utc.isoformat(),
                    "brief1EndUtc": duty.duty_sch_str_dt_utc.isoformat(),
                    "debrief1Airport": duty.duty_end_arp,
                    "debrief1StartUtc": duty.duty_sch_end_dt_utc.isoformat(),
                    "debrief1EndUtc": duty.duty_sch_end_dt_utc.isoformat(),
                    "dropoff1StartUtc": duty.duty_sch_end_dt_utc.isoformat(),
                    "dropoff1EndUtc": duty.duty_sch_end_dt_utc.isoformat(),
                    "pickup2StartUtc": now_utc,
                    "pickup2EndUtc": now_utc,
                    "brief2Airport": duty.duty_str_arp,
                    "brief2StartUtc": now_utc,
                    "brief2EndUtc": now_utc,
                    "debrief2Airport": duty.duty_end_arp,
                    "debrief2StartUtc": now_utc,
                    "debrief2EndUtc": now_utc,
                    "dropoff2StartUtc": now_utc,
                    "dropoff2EndUtc": now_utc,
                    "pickup3StartUtc": now_utc,
                    "pickup3EndUtc": now_utc,
                    "brief3Airport": duty.duty_str_arp,
                    "brief3StartUtc": now_utc,
                    "brief3EndUtc": now_utc,
                    "debrief3Airport": duty.duty_end_arp,
                    "debrief3StartUtc": now_utc,
                    "debrief3EndUtc": now_utc,
                    "dropoff3StartUtc": now_utc,
                    "dropoff3EndUtc": now_utc,
                })

        return {
            "pairingLabel": pairing.pairing_label or f"PO-{seq:04d}",
            "base": pairing.base,
            "fleet": pairing.fleet,
            "division": pairing.division,
            "assignmentGroup": pairing.assignment_group,
            "assignment": pairing.assignment,
            "schStrDtUtc": pairing.sch_str_dt_utc.isoformat(),
            "schEndDtUtc": pairing.sch_end_dt_utc.isoformat(),
            "actStrDtUtc": pairing.sch_str_dt_utc.isoformat(),
            "actEndDtUtc": pairing.sch_end_dt_utc.isoformat(),
            "durationDays": pairing.duration_days,
            "tafb": pairing.tafb,
            "dutyCount": pairing.duty_count,
            "segCount": pairing.seg_count,
            "source": pairing.source,
            "segments": segments_payload,
        }
