import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.config.settings import settings

app = FastAPI(title='AI Server', version='0.1.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list(),
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/ai/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}


from src.chat.routes import router as chat_router  # noqa: E402
app.include_router(chat_router)

from src.regression.routes import router as regression_router  # noqa: E402
app.include_router(regression_router)

from src.crewbids.routes import router as crewbids_router  # noqa: E402
app.include_router(crewbids_router)

from src.live.routes import router as live_router  # noqa: E402
app.include_router(live_router)


if __name__ == '__main__':
    uvicorn.run('main:app', host='0.0.0.0', port=settings.port, reload=False)
