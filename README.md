# Jetlag Game API

REST API backing our version of the Jetlag "Hide and Seek" card game.

## Stack

- **[FastAPI](https://fastapi.tiangolo.com/)** - web framework. Chosen because
  new endpoints are just a Python function + a decorator, it gives you
  request validation and interactive docs (`/docs`) for free, and it pairs
  natively with SQLModel.
- **[SQLModel](https://sqlmodel.tiangolo.com/)** - ORM. A thin layer on top of
  SQLAlchemy + Pydantic, so each model class doubles as both the DB table
  definition and the API schema. Works unchanged against SQLite or
  PostgreSQL - only the connection URL differs.

## Project structure

```
jetlag-api/
├── app/
│   ├── __init__.py
│   ├── models.py     # ORM data model: Card, Team, CardState, TeamColor
│   ├── database.py   # engine/session setup, driven by DATABASE_URL
│   └── main.py       # FastAPI app entrypoint (endpoints added here next)
├── requirements.txt
├── .env.example
└── README.md
```

## Data model

### Cards (table `cards`)

Composite primary key: `(game_id, card_id)`.

| Field                 | Type                  | Notes                          |
|-----------------------|------------------------|---------------------------------|
| game_id               | str (PK)               |                                  |
| card_id               | int (PK)               |                                  |
| card_name             | str                    |                                  |
| card_state            | enum `CardState`       | InDeck / OnPublicBoard / OnPrivateBoard / Claimed |
| challenge_title       | str                    |                                  |
| challenge_description | str                    |                                  |
| visible_from          | datetime, optional     |                                  |
| private_board_team    | str, optional          |                                  |
| claimed_team          | str, optional          |                                  |
| is_wild_card          | bool, default `False`  |                                  |
| updated_timestamp     | datetime, default now  |                                  |

### Teams (table `teams`)

Composite primary key: `(game_id, team_color)`.

| Field             | Type                  | Notes                    |
|-------------------|------------------------|---------------------------|
| game_id           | str (PK)               |                            |
| team_color        | enum `TeamColor` (PK)  | orange / blue / purple    |
| team_name         | str                    |                            |
| can_discard_card  | bool, default `False`  |                            |

## Setup

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # defaults to local SQLite
```

## Run

```bash
uvicorn app.main:app --reload
```

- App: http://127.0.0.1:8000
- Interactive API docs: http://127.0.0.1:8000/docs
- Health check: http://127.0.0.1:8000/health

Tables are created automatically on startup (`init_db()` in
`app/database.py`), for both SQLite and PostgreSQL.

## Switching to PostgreSQL

Set `DATABASE_URL` (in `.env` or the environment) to something like:

```
postgresql://user:password@localhost:5432/jetlag
```

No code changes needed - `app/database.py` picks it up automatically.

## Next steps

- Add routers for `Cards` and `Teams` CRUD endpoints under `app/routers/`
  and include them in `app/main.py`.
- Add Pydantic "create"/"update" schemas if we don't want to expose every
  ORM field directly on the API (e.g. hide `updated_timestamp` from input).
