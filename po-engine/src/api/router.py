"""Central router registration."""

from fastapi import FastAPI

from .health import router as health_router
from .optimize import router as optimize_router
from .scenario import router as scenario_router


def create_router(app: FastAPI) -> None:
    """Register all API routers onto the FastAPI app."""
    app.include_router(health_router)
    app.include_router(optimize_router)
    app.include_router(scenario_router)
