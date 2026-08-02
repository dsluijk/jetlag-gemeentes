"""
Jetlag Game API - application entrypoint.

Wires up the app, DB startup/table creation, and the games router
(app/routers/games.py), plus a simple health check.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import init_db
from app.routers.games import router as games_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Jetlag Game API", version="0.1.0", lifespan=lifespan)

app.include_router(games_router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
