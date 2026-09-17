/**
 * App configuration.
 *
 * Fill in API_BASE_URL before running this for real. GAME_ID and
 * MY_TEAM_COLOR are read from the URL for now (?game=ABC123&team=orange)
 * since there's no login flow yet - see README.md.
 */
const CONFIG = {
  // Point this at your running backend (see the jetlag-api project).
  API_BASE_URL: "",

  // Path to the KML file with gemeente boundary polygons. Replace
  // data/gemeentes.sample.kml with your real My Maps export (same
  // filename, or update this path).
  KML_PATH: "data/CBS_2025_filtered_gemeenten.kml",

  // Whether to render an actual basemap (OpenStreetMap tiles) behind the
  // gemeente polygons, or just a flat background color. Turning this off
  // avoids any tile requests entirely - useful if you'd rather keep the
  // focus on the polygons, or want to swap in your own basemap later.
  SHOW_BASEMAP: true,

  // MapLibre uses [lng, lat] order (opposite of some other map APIs).
  // Roughly centers on the eastern Netherlands; adjust to taste.
  MAP_CENTER: [6.15, 52.25],
  MAP_ZOOM: 9,

  TEAM_COLORS: {
    orange: "#E2762A",
    purple: "#552b7f",
    pink: "#FF46A2",
    green: "#008000",
    yellow: "#FFED29",
  },

  MAP_FILL: {
    background: "#EEEEEE", // if no BASEMAP is configured
    hidden: "#FFFFFF", // not on the public or private board (to us)
    hiddenOpacity: 0.8,
    public: "#93c4d4",
    publicOpacity: 0.32,
    privateOpacity: 0.32,
    claimedOpacity: 0.8,
    strokeColor: "#8A8672",
  },

  // IMPORTANT - this must list every gemeente in EXACTLY the same order
  // as GEMEENTES in the backend's app/game_data.py. The backend assigns
  // card_id as (index + 1) in that list when it seeds a new game, and
  // that id is never sent to us for gemeentes we can't yet see (e.g.
  // still InDeck, or on another team's unrevealed private board). We
  // need it anyway to let a wild-card claim target an unseen gemeente,
  // so we recompute the same id locally instead. If the two lists ever
  // drift apart, wild-card claims will target the wrong card - worth
  // eventually replacing with a small backend endpoint that hands back
  // "all card names + ids" directly instead of duplicating this list.
  GEMEENTES: [
    "Aalten", "Almelo", "Apeldoorn", "Arnhem", "Barneveld", "Berkelland",
    "Borne", "Bronckhorst", "Brummen", "Dalfsen", "Deventer", "Dinkelland",
    "Doesburg", "Doetinchem", "Duiven", "Ede", "Elburg", "Enschede", "Epe",
    "Ermelo", "Haaksbergen", "Hardenberg", "Harderwijk", "Hattem", "Heerde",
    "Hellendoorn", "Hengelo", "Hof van Twente", "Kampen", "Lochem", "Losser",
    "Montferland", "Nijkerk", "Nunspeet", "Oldebroek", "Oldenzaal",
    "Olst-Wijhe", "Ommen", "Oost Gelre", "Oude IJsselstreek", "Putten",
    "Raalte", "Renkum", "Rheden", "Rijssen-Holten", "Rozendaal",
    "Scherpenzeel", "Staphorst", "Steenwijkerland", "Tubbergen",
    "Twenterand", "Voorst", "Wageningen", "Westervoort", "Wierden",
    "Winterswijk", "Zevenaar", "Zutphen", "Zwartewaterland", "Zwolle",
  ],
};

/** Card id the backend would have assigned this gemeente at seed time. */
function gemeenteCardId(name) {
  const index = CONFIG.GEMEENTES.indexOf(name);
  return index === -1 ? null : index + 1;
}

function getGameId() {
  return new URLSearchParams(window.location.search).get("game");
}

function getMyTeamColor() {
  return new URLSearchParams(window.location.search).get("team");
}
