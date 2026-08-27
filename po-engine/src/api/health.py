"""Health check endpoint."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/api/po/health")
async def health():
    """Health check."""
    return {"code": 200, "data": {"status": "ok"}, "message": "ok"}
