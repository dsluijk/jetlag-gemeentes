"""
Team authentication.

This is a speed bump, not security. The game is played among friends and
everything else about the API is wide open, so the goal is only to stop
one team acting as another - reading someone else's private board before
its reveal time, or claiming a card in their name - which until now was a
matter of editing the team color in the URL.

Each team gets a token when the game is created. It is stored in
plaintext on the team row (see app/models.py) and compared as-is here.
Nothing is hashed and nothing expires beyond the cookie itself: recovering
a lost token is a SELECT, which is the point.

The token travels in a cookie that the browser is handed once by
POST /{game_id}/{team_color}/login and then attaches to every same-origin
request by itself, so no other code has to carry it around.

Imports here are limited to app.database and app.models on purpose:
app.services imports generate_team_token() from this module, so importing
app.services back would be a cycle.
"""

import secrets
from typing import Optional

from fastapi import Cookie, Depends, HTTPException, Path, Response, status
from sqlmodel import Session

from app.database import get_session
from app.models import Team, TeamColor

TOKEN_COOKIE = "gg_token"

# A game is over in a weekend; this only exists so a phone that never
# plays again eventually forgets the token.
COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

# No O/0 or I/1/L: a token gets read out loud across a table and typed
# into a phone, and that's where it would go wrong. 8 characters from
# these 31 is ~40 bits, far more than a group of friends needs.
TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
TOKEN_LENGTH = 8


def generate_team_token() -> str:
    """A fresh token for one team, drawn from a readable-out-loud alphabet."""
    return "".join(secrets.choice(TOKEN_ALPHABET) for _ in range(TOKEN_LENGTH))


def token_matches(team: Team, token: Optional[str]) -> bool:
    """
    Whether `token` is this team's token.

    Compared on the encoded values because the str form of
    compare_digest() raises on anything outside ASCII, and the token
    arrives from a cookie the client controls. An empty token never
    matches either side, so a team without one is locked rather than
    wide open.
    """
    if not token or not team.token:
        return False
    return secrets.compare_digest(token.encode(), team.token.encode())


def set_team_cookie(response: Response, token: str) -> None:
    """
    Hand the browser the cookie every team-scoped endpoint looks for.

    HttpOnly because no frontend code needs to read it back - the browser
    attaches it to same-origin requests on its own, and the backend serves
    the frontend itself (app.frontend in app/main.py), so same-origin
    holds. Deliberately not Secure: local development runs over plain
    http, where browsers would drop the cookie without a word.
    """
    response.set_cookie(
        TOKEN_COOKIE,
        token,
        max_age=COOKIE_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        path="/",
    )


def require_team(
    game_id: str = Path(...),
    team_color: TeamColor = Path(...),
    token: Optional[str] = Cookie(default=None, alias=TOKEN_COOKIE),
    session: Session = Depends(get_session),
) -> Team:
    """
    Dependency for the endpoints that act as a team: 401 unless the
    cookie holds that team's token.

    Re-declaring the two path parameters the route already takes is fine -
    FastAPI merges a dependency's parameters into the operation and
    de-duplicates them by (location, name) - and Depends(get_session) is
    cached per request, so this shares the endpoint's own session rather
    than opening a second one.
    """
    team = session.get(Team, (game_id, team_color))
    if team is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Team '{team_color.value}' not found in game '{game_id}'.",
        )
    if not token_matches(team, token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Wrong or missing token for team '{team_color.value}'.",
        )
    return team
