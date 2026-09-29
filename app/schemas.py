"""
Request/response schemas that are *not* 1:1 with a DB table.

Card (in app/models.py) is a SQLModel table model and is returned
directly as a response model where the API output should just be "the
row" - that keeps things simple, per the project's design goal of
easy-to-add endpoints.

Team is the exception: its row carries the team's token, so it is never
returned as-is. TeamPublic below is what the API hands out instead.
"""

from typing import List

from pydantic import BaseModel, ConfigDict, field_validator

from app.models import TeamColor


class TeamCreate(BaseModel):
    """One team to create as part of POST /{game_id}/create."""

    team_color: TeamColor
    team_name: str


class GameCreateRequest(BaseModel):
    """Body of POST /{game_id}/create."""

    teams: List[TeamCreate]

    @field_validator("teams")
    @classmethod
    def validate_teams(cls, teams: List[TeamCreate]) -> List[TeamCreate]:
        if len(teams) < 2:
            raise ValueError("A game needs more than 1 team.")
        colors = [t.team_color for t in teams]
        if len(colors) != len(set(colors)):
            raise ValueError("Team colors must be unique within a game.")
        return teams


class TeamPublic(BaseModel):
    """
    A team as anyone is allowed to see it.

    Every field of the Team row except its token, which is the whole
    reason this exists: GET /{game_id}/teams is unauthenticated - the join
    page has to list the teams before anyone has a token - so returning
    the row itself would hand every team's token to whoever asked.
    """

    model_config = ConfigDict(from_attributes=True)

    game_id: str
    team_color: TeamColor
    team_name: str
    can_discard_card: bool


class TeamToken(BaseModel):
    """
    A team together with its token, returned only by game creation.

    Tokens are generated server-side, so this is the one moment they are
    handed out: the organiser reads them off the create page and passes
    each team its own.
    """

    team_color: TeamColor
    team_name: str
    token: str


class TeamLoginRequest(BaseModel):
    """Body of POST /{game_id}/{team_color}/login."""

    token: str


class GameCreateResponse(BaseModel):
    game_id: str
    teams_created: int
    cards_seeded: int
    cards_on_public_board: int
    teams: List[TeamToken]


class GameSummary(BaseModel):
    """One row of GET /games - a game id plus how many teams are in it."""

    game_id: str
    team_count: int
