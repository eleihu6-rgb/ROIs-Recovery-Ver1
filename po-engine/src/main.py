import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI

load_dotenv()

from src.config import settings
from src.api.router import create_router
from src.utils.logging import setup_logging

setup_logging(settings.log_level)

app = FastAPI(title="PO Engine", version="0.1.0")

create_router(app)


if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )
