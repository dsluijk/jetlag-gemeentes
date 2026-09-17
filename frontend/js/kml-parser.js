/**
 * Parses a KML document (as exported by Google My Maps) into a GeoJSON
 * FeatureCollection that MapLibre GL JS can use directly as a source.
 *
 * KML coordinates are written "lng,lat,alt" - the same [lng, lat] order
 * GeoJSON expects, so no axis-swapping is needed here (unlike some other
 * mapping APIs).
 */
const KmlParser = {
  /**
   * @param {string} kmlText raw KML file contents
   * @returns {GeoJSON.FeatureCollection}
   */
  parse(kmlText) {
    const doc = new DOMParser().parseFromString(kmlText, "text/xml");

    if (doc.querySelector("parsererror")) {
      throw new Error("Couldn't parse the KML file - is it valid XML?");
    }

    const placemarks = Array.from(doc.getElementsByTagName("Placemark"));
    const features = [];

    for (const placemark of placemarks) {
      const name = extractGemeenteName(placemark);
      if (!name) continue; // skip placemarks we can't identify

      const geometry = extractGeometry(placemark);
      if (!geometry) continue; // e.g. a point placemark, not a polygon

      features.push({
        type: "Feature",
        properties: { name },
        geometry,
      });
    }

    return { type: "FeatureCollection", features };
  },
};

/**
 * Looks for <ExtendedData>...<SimpleData name="gemeentenaam">X</SimpleData>,
 * falling back to the plain <name> element if that schema isn't present.
 */
function extractGemeenteName(placemark) {
  const simpleDataNodes = Array.from(placemark.getElementsByTagName("SimpleData"));
  const match = simpleDataNodes.find(
    (node) => (node.getAttribute("name") || "").toLowerCase() === "gemeentenaam"
  );
  if (match && match.textContent.trim()) {
    return match.textContent.trim();
  }

  const nameEl = placemark.getElementsByTagName("name")[0];
  return nameEl ? nameEl.textContent.trim() : null;
}

/**
 * Builds a GeoJSON Polygon or MultiPolygon geometry for a placemark.
 *
 * A placemark can contain one <Polygon> (optionally with holes via
 * innerBoundaryIs), or a <MultiGeometry> with several <Polygon>s (e.g. a
 * gemeente with a disjoint exclave). GeoJSON's Polygon type only allows
 * one outer ring, so several separate polygons must become a
 * MultiPolygon rather than being flattened together.
 */
function extractGeometry(placemark) {
  const polygonEls = Array.from(placemark.getElementsByTagName("Polygon"));
  if (polygonEls.length === 0) return null;

  const polygons = polygonEls
    .map((polygonEl) => {
      const outer = polygonEl.getElementsByTagName("outerBoundaryIs")[0];
      const outerRing = outer ? extractRing(outer) : null;
      if (!outerRing) return null;

      const holes = Array.from(polygonEl.getElementsByTagName("innerBoundaryIs"))
        .map(extractRing)
        .filter(Boolean);

      return [outerRing, ...holes];
    })
    .filter(Boolean);

  if (polygons.length === 0) return null;
  if (polygons.length === 1) return { type: "Polygon", coordinates: polygons[0] };
  return { type: "MultiPolygon", coordinates: polygons };
}

function extractRing(boundaryEl) {
  const coordsEl = boundaryEl.getElementsByTagName("coordinates")[0];
  if (!coordsEl) return null;

  const ring = coordsEl.textContent
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((triplet) => triplet.split(",").map(Number).slice(0, 2)); // [lng, lat]

  return ring.length >= 3 ? ring : null;
}
