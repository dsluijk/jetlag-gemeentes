"""
Database engine & session configuration.

Controlled entirely by the DATABASE_URL environment variable, so the same
codebase runs against SQLite (great for local dev / tests) or PostgreSQL
(for staging / production) without any code changes.

Examples:
    SQLite:     sqlite:///./jetlag.db
    PostgreSQL: postgresql://user:password@localhost:5432/jetlag
"""

import os

from sqlmodel import Session, SQLModel, create_engine

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./jetlag.db")

# SQLite needs this flag when used from multiple threads (e.g. FastAPI's
# default threadpool for sync endpoints). It's a no-op for PostgreSQL.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)


def init_db() -> None:
    """Create all tables that don't exist yet. Safe to call on every startup."""
    # Import models here so SQLModel.metadata is aware of them before
    # create_all runs, without forcing an import-order dependency at
    # module load time.
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session():
    """FastAPI dependency that yields a DB session, closed after the request."""
    with Session(engine) as session:
        yield session
