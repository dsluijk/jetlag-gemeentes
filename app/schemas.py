"""
Request/response schemas that are *not* 1:1 with a DB table.

Card and Team (in app/models.py) are SQLModel table models and are
returned directly as response models where the API output should just be
"the row" - that keeps things simple, per the project's design goal of
easy-to-add endpoints.
"""

from typing import List

from pydantic import BaseModel, field_validator

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


class GameCreateResponse(BaseModel):
    game_id: str
    teams_created: int
    cards_seeded: int
    cards_on_public_board: int
