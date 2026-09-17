/**
 * Owns the MapLibre GL map instance and the single GeoJSON source
 * holding every gemeente polygon. `applyStyles()` mutates each
 * feature's paint-relevant properties (fillColor, fillOpacity, ...)
 * from the current State and re-sets the source data - called once
 * after every state refresh, never incrementally, so the map can never
 * end up showing a stale color for one gemeente.
 */
const MapView = {
  map: null,
  geojson: null,
  loaded: false,
  onGemeenteClick: null,
  _pendingStyleUpdate: false,

  /**
   * @param {HTMLElement} mapDiv
   * @param {GeoJSON.FeatureCollection} geojson gemeente polygons, from KmlParser.parse()
   * @param {(name: string) => void} onGemeenteClick
   */
  init(mapDiv, geojson, onGemeenteClick) {
    this.geojson = geojson;
    this.onGemeenteClick = onGemeenteClick;

    this.map = new maplibregl.Map({
      container: mapDiv,
      style: buildBaseStyle(),
      center: CONFIG.MAP_CENTER,
      zoom: CONFIG.MAP_ZOOM,
      attributionControl: CONFIG.SHOW_BASEMAP, // only needed when we're actually using OSM tiles
    });

    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    this.map.on("load", () => {
      this.map.addSource("gemeentes", { type: "geojson", data: this.geojson });

      this.map.addLayer({
        id: "gemeentes-fill",
        type: "fill",
        source: "gemeentes",
        paint: {
          "fill-color": ["get", "fillColor"],
          "fill-opacity": ["get", "fillOpacity"],
        },
      });

      this.map.addLayer({
        id: "gemeentes-outline",
        type: "line",
        source: "gemeentes",
        paint: {
          "line-color": ["get", "strokeColor"],
          "line-opacity": ["get", "strokeOpacity"],
          "line-width": 1.5,
        },
      });

      this.map.on("click", "gemeentes-fill", (e) => {
        if (e.features && e.features[0]) {
          this.onGemeenteClick(e.features[0].properties.name);
        }
      });
      this.map.on("mouseenter", "gemeentes-fill", () => {
        this.map.getCanvas().style.cursor = "pointer";
      });
      this.map.on("mouseleave", "gemeentes-fill", () => {
        this.map.getCanvas().style.cursor = "";
      });

      const bounds = computeBounds(this.geojson);
      if (bounds) this.map.fitBounds(bounds, { padding: 24, duration: 0 });

      this.loaded = true;
      if (this._pendingStyleUpdate) {
        this._pendingStyleUpdate = false;
        this.applyStyles();
      }
    });
  },

  /** Recolor every polygon from the current State. Call after any refresh. */
  applyStyles() {
    if (!this.geojson) return;

    for (const feature of this.geojson.features) {
      const card = State.cardByName(feature.properties.name);
      Object.assign(feature.properties, this._styleFor(card));
    }

    if (!this.loaded) {
      // Map style/source isn't ready yet - applied as soon as it is.
      this._pendingStyleUpdate = true;
      return;
    }

    const source = this.map.getSource("gemeentes");
    if (source) source.setData(this.geojson);
  },

  _styleFor(card) {
    const fill = CONFIG.MAP_FILL;

    if (!card) {
      // Not on the public or private board, as far as we can see.
      return { fillColor: fill.hidden, fillOpacity: fill.hiddenOpacity, strokeColor: fill.strokeColor, strokeOpacity: 0.35 };
    }

    if (card.card_state === "Claimed") {
      const color = CONFIG.TEAM_COLORS[card.claimed_team] || "#999999";
      return { fillColor: color, fillOpacity: fill.claimedOpacity, strokeColor: color, strokeOpacity: 0.9 };
    }

    if (card.card_state === "OnPublicBoard") {
      return { fillColor: fill.public, fillOpacity: fill.publicOpacity, strokeColor: fill.strokeColor, strokeOpacity: 0.6 };
    }

    if (card.card_state === "OnPrivateBoard") {
      // Only ever true for our own team - other teams' private cards never appear in our card list.
      const color = CONFIG.TEAM_COLORS[card.private_board_team] || fill.public;
      return { fillColor: color, fillOpacity: fill.privateOpacity, strokeColor: color, strokeOpacity: 0.6 };
    }

    return { fillColor: fill.hidden, fillOpacity: fill.hiddenOpacity, strokeColor: fill.strokeColor, strokeOpacity: 0.35 };
  },
};

/**
 * Builds the MapLibre style JSON for the base map, honoring
 * CONFIG.SHOW_BASEMAP. When it's off, no tiles are requested at all -
 * just a flat background color behind the gemeente polygons.
 */
function buildBaseStyle() {
  if (!CONFIG.SHOW_BASEMAP) {
    return {
      version: 8,
      sources: {},
      layers: [{ id: "background", type: "background", paint: { "background-color": CONFIG.MAP_FILL.background } }],
    };
  }

  // Plain OpenStreetMap raster tiles - free, no API key required. Swap
  // this for a vector style (e.g. from MapTiler/Stadia/etc., which do
  // need a key) if you want nicer basemap styling or expect traffic
  // beyond OSM's fair-use tile policy - see README.md.
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "&copy; OpenStreetMap contributors",
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  };
}

/** [[minLng, minLat], [maxLng, maxLat]] across every coordinate in a FeatureCollection, or null if empty. */
function computeBounds(geojson) {
  const points = [];
  for (const feature of geojson.features) collectPoints(feature.geometry.coordinates, points);
  if (points.length === 0) return null;

  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of points) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

/** Recursively flattens Polygon/MultiPolygon coordinate arrays down to raw [lng, lat] pairs. */
function collectPoints(coords, out) {
  if (typeof coords[0] === "number") {
    out.push(coords);
  } else {
    for (const c of coords) collectPoints(c, out);
  }
}
