/**
 * Looks up the SVG outline to draw on a gemeente's card.
 *
 * img/gemeentes/ is generated from the CBS KML by
 * scripts/export_gemeente_svgs.py, which also writes the index.json this
 * reads. The filenames are slugged gemeente names, but deriving that slug
 * again here would be the same rule written in a second language and free
 * to drift from the first, so the index stays the only place the
 * name -> file mapping lives.
 *
 * Shapes are decoration: a card without one still says which gemeente it
 * is. So a failed load leaves every lookup returning null and the deck
 * falling back to name-only cards, rather than taking the board down.
 */
const GemeenteShapes = {
  _urls: new Map(),
  _outlines: new Map(),

  /** Fetch the index. Throws; the caller decides how loudly to fail. */
  async load() {
    const base = CONFIG.GEMEENTE_SHAPES_PATH;
    const index = await fetch(`${base}index.json`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });

    for (const gemeente of index.gemeentes) {
      // Absolute, deliberately. These end up in a CSS url() inside a custom
      // property, and a relative one there is resolved against the
      // stylesheet that substitutes the var - css/styles.css - rather than
      // against the page, so it would go looking in css/img/gemeentes/.
      // Resolving against the document here settles it for every consumer.
      this._urls.set(gemeente.name, new URL(`${base}${gemeente.file}`, document.baseURI).href);
    }
  },

  /**
   * Absolute URL of the gemeente's SVG, or null if there isn't one - which
   * is the normal answer for a wild card, since those aren't a place.
   */
  urlFor(name) {
    return this._urls.get(name) || null;
  },

  /**
   * The SVG at `url` as a detached <svg> element rather than a URL to
   * point CSS at. A mask can only be revealed all at once, but a live
   * <path> can be traced, which is what the reveal after a claim or a
   * discard draws with - see traceOutline() in js/ui.js.
   *
   * Takes a URL rather than a gemeente name so the wild card's star,
   * which isn't a place and so isn't in the index, traces through the
   * same code. Resolves to null on any failure, like urlFor(): the card
   * it decorates still says which gemeente it is.
   *
   * Each call gets its own copy, since two reveals can be looking at the
   * same gemeente and a node only lives in one place at a time.
   */
  async fetchOutline(url) {
    let pending = this._outlines.get(url);
    if (!pending) {
      pending = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.text();
        })
        .then((text) => {
          // A parse failure hands back a <parsererror> document rather
          // than throwing, so the root element is what gets checked.
          const doc = new DOMParser().parseFromString(text, "image/svg+xml");
          if (doc.documentElement.localName !== "svg") {
            throw new Error("not an SVG");
          }
          return doc.documentElement;
        })
        .catch((err) => {
          // Left out of the cache, so the next reveal of the same
          // gemeente tries again: this is decoration, and one dropped
          // request shouldn't cost it the rest of the game.
          this._outlines.delete(url);
          console.warn(`Couldn't load the outline at ${url}.`, err);
          return null;
        });
      this._outlines.set(url, pending);
    }

    const svg = await pending;
    return svg ? svg.cloneNode(true) : null;
  },
};
