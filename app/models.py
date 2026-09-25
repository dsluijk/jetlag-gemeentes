"""
ORM data model for the Jetlag Game API.

Framework: SQLModel (built on top of SQLAlchemy + Pydantic).
SQLModel lets a single class definition serve as both the database table
schema (ORM) and the request/response schema (Pydantic), which keeps new
endpoints quick to write. It works out of the box with both SQLite and
PostgreSQL - only the connection URL passed to `create_engine` changes
(see app/database.py).
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


class CardState(str, Enum):
    """Where a given Card currently sits in the game."""

    IN_DECK = "InDeck"
    ON_PUBLIC_BOARD = "OnPublicBoard"
    ON_PRIVATE_BOARD = "OnPrivateBoard"
    CLAIMED = "Claimed"


class TeamColor(str, Enum):
    """The three team colors used in the Jetlag game."""

    ORANGE = "orange"
    PURPLE = "purple"
    PINK = "pink"
    GREEN = "green"
    YELLOW = "yellow"


class Card(SQLModel, table=True):
    """
    A single challenge card belonging to a specific game.

    Primary key is the composite (game_id, card_id), since card ids are
    only unique within a given game.
    """

    __tablename__ = "cards"

    game_id: str = Field(primary_key=True, index=True)
    card_id: int = Field(primary_key=True)

    card_name: str
    card_state: CardState = Field(default=CardState.IN_DECK, index=True)

    challenge_title: str
    challenge_description: str
    challenge_link: Optional[str] = Field(default=None)

    # Optional fields
    visible_from: Optional[datetime] = Field(default=None)
    private_board_team: Optional[str] = Field(default=None)
    claimed_team: Optional[str] = Field(default=None)

    is_wild_card: bool = Field(default=False)

    updated_timestamp: datetime = Field(default_factory=datetime.utcnow)


class Team(SQLModel, table=True):
    """
    A team participating in a specific game.

    Primary key is the composite (game_id, team_color), since each game
    has at most one team per color.
    """

    __tablename__ = "teams"

    game_id: str = Field(primary_key=True, index=True)
    team_color: TeamColor = Field(primary_key=True)

    team_name: str
    can_discard_card: bool = Field(default=False)
