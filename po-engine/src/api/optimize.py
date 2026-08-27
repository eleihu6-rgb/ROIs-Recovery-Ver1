"""POST /api/po/optimize — submit an optimization task."""

import logging

from fastapi import APIRouter, BackgroundTasks

from src.models.optimize import OptimizeRequest, OptimizeResult
from src.optimizer.pairing_optimizer import PairingOptimizer

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory store for results (keyed by a simple counter).
# In production this would be replaced by a proper task queue (BullMQ/Redis).
_results: dict[int, OptimizeResult] = {}
_counter = 0


@router.post("/api/po/optimize")
async def optimize(request: OptimizeRequest, background_tasks: BackgroundTasks):
    """Submit a pairing optimization task.

    If the flight count is small (< 20), runs synchronously.
    Otherwise, returns immediately and runs in the background.
    """
    optimizer = PairingOptimizer()

    # For small problems, run synchronously
    result = await optimizer.optimize(request)

    return {
        "code": 200,
        "data": result.model_dump(),
        "message": "ok",
    }


@router.get("/api/po/result/{task_id}")
async def get_result(task_id: int):
    """Get the result of a previous optimization task."""
    if task_id in _results:
        return {
            "code": 200,
            "data": _results[task_id].model_dump(),
            "message": "ok",
        }
    return {"code": 404, "data": None, "message": "Task not found"}
