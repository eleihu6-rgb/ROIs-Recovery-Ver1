import logging
import logging.handlers
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from routes.sync import router as sync_router
from routes.scheduler_routes import router as scheduler_router
from scheduler import scheduler_manager
from config import settings

_log_dir = Path(__file__).resolve().parent.parent / "logs"
_log_dir.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

_file_handler = logging.handlers.RotatingFileHandler(
    _log_dir / "data-migration.log",
    maxBytes=100 * 1024 * 1024,
    backupCount=5,
    encoding="utf-8",
)
_file_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
logging.getLogger().addHandler(_file_handler)


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler_manager.start()
    yield
    scheduler_manager.shutdown()


app = FastAPI(title="F8 Data Migration", version="1.0.0", lifespan=lifespan)
app.include_router(sync_router)
app.include_router(scheduler_router)


@app.get("/health")
def health():
    return {"status": "ok"}