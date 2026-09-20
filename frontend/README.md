# Gemeentejacht - Jetlag game frontend

Mobile-first web frontend for the jetlag-api backend: a MapLibre map of
gemeente boundaries, a cards panel, a score bar, and the claim/discard
flows.

## Stack

Plain HTML/CSS/JS - no build step, no framework, no bundler. Every file
is a classic `<script src>` defining globals (`CONFIG`, `Api`, `State`,
`UI`, ...); there are no ES modules. Start the backend and it runs - see
Setup below.

- **[MapLibre GL JS](https://maplibre.org/)** for the map - open source,
  no API key required. Gemeente polygons are parsed from your KML file
  client-side and added as a GeoJSON source, so every polygon can be
  recolored instantly from game state.
- Everything else is vanilla JS, split into small single-purpose files
  under `js/` (see "Architecture" below).

## Setup

The backend serves this folder itself (`app.frontend("/", directory="frontend")`
in `app/main.py`), so there's no separate static server and no CORS to
configure - `CONFIG.API_BASE_URL` is deliberately empty, making every
request same-origin.

1. Replace `data/gemeentes.sample.kml` with your real My Maps KML export
   (same filename, or update `CONFIG.KML_PATH` in `js/config.js`). It
   must use `<ExtendedData><SchemaData><SimpleData name="gemeentenaam">`
   for each placemark's name - that's what the parser looks for.
2. Run the backend from the repo root (the `frontend` path is relative to
   the working directory):
   ```bash
   uvicorn app.main:app --reload
   ```
3. Open `http://localhost:8000/` and pick a game and a team. You need at
   least one game to exist - create one with
   `POST /{game_id}/create` if the list is empty.

## Pages

- **`index.html`** - the join page at `/`. Lists games from `GET /games`
  and the chosen game's teams from `GET /{game_id}/teams`, then sends you
  to the board. It pre-fills your last pick from `localStorage` but never
  skips itself, so switching teams stays possible. Links that still point
  at `/?game=…&team=…` are redirected to the board.
- **`board.html`** - the map board, opened as
  `board.html?game=<GAME_ID>&team=<TEAM_COLOR>`. Without both parameters
  it redirects back to the join page. There's no login flow, so the game
  id and team color are still just URL parameters.

## Architecture

```
jetlag-frontend/
├── index.html                  # join page: pick a game + team
├── board.html                  # the map board
├── css/styles.css
├── data/gemeentes.sample.kml   # replace with your real export
└── js/
    ├── config.js       # all tunables: API URL, colors, basemap toggle, gemeente list
    ├── api.js          # fetch wrappers for the backend endpoints
    ├── join.js         # join page: game/team pickers (loads only config.js + api.js)
    ├── kml-parser.js   # KML -> GeoJSON, using the browser's DOMParser
    ├── state.js        # single source of truth + derived views (panel cards, scores, ...)
    ├── map-view.js      # MapLibre map, GeoJSON source, per-feature styling
    ├── ui.js            # cards panel, score bar, claim/discard modal, toasts
    └── main.js          # bootstraps the board, owns the refresh cycle
```

**State flow**: every API response is written into `State`. After any
change - initial load, manual refresh, or the result of a claim/discard

- `MapView.applyStyles()` and `UI.render()` redraw the map, cards panel,
  and score bar entirely from `State`. Nothing is patched incrementally, so
  the UI can't drift out of sync with itself. At this game's scale
  (~60 cards, a handful of teams) a full redraw is cheap.

**Refreshing**: per your instructions, there's no polling and no
websockets - only the refresh button (spinner icon, top right), plus an
automatic refresh right after your own claim/discard so you immediately
see its effect. To see _other_ teams' moves, someone has to tap refresh.

## The basemap toggle

`CONFIG.SHOW_BASEMAP` (in `js/config.js`):

- `true` (default): renders plain OpenStreetMap raster tiles behind the
  polygons. Free, no API key - but it is a shared public service, so
  it's meant for light/occasional use (a friend group's game night), not
  heavy production traffic. If you outgrow it, swap `buildBaseStyle()`
  in `js/map-view.js` for a vector style from a provider that does need
  a key (MapTiler, Stadia, etc.) - everything else (the GeoJSON source,
  the fill/line layers, the click handling) stays the same.
- `false`: no basemap at all, not even a tile request - just a flat
  background color behind the polygons.

## Known limitations / things worth revisiting

- **The `GEMEENTES` list in `js/config.js` duplicates
  `app/game_data.py`** in the backend. The wild-card claim flow needs to
  offer _every_ unclaimed gemeente as a target, including ones this team
  has never seen a `Card` object for (still `InDeck`, or on another
  team's unrevealed private board) - so it can't rely on data the API
  has actually sent. Instead it recomputes the same `card_id` the
  backend would have assigned (`index + 1` in that list) and trusts that
  the two lists stay in sync. If they ever drift, wild-card claims will
  target the wrong card. The clean fix is a small backend endpoint that
  returns "all card names + ids" directly; worth adding once this proves
  out.
- **No team roster caching**: `GET /{game_id}/teams` is re-fetched on
  every refresh alongside cards. Teams rarely change mid-game, so this
  is deliberate simplicity over a micro-optimization, not an oversight.
- **Scoring** is a flat count of claimed gemeentes per team
  (`State.scores()` in `js/state.js`), matching the current backend
  logic. It's factored into its own function specifically so it can
  later be swapped for a connected-component count without touching any
  rendering code - that version will need a gemeente adjacency graph,
  which doesn't exist yet on either side.
- **No auth**: `game` and `team` are plain URL query parameters. Anyone
  with the URL can act as that team. Fine for a friend group who trust
  each other; not fine beyond that.
