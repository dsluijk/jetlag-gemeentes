"""
Jetlag Game API - application entrypoint.

This currently only wires up the app, DB startup, and a health check.
Endpoints for Cards / Teams will be added as routers in app/routers/
in the next step.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Jetlag Game API", version="0.1.0", lifespan=lifespan)


@app.get("/health")
def health_check():
    return {"status": "ok"}
