/**
 * Single source of truth for the current game state. Every render pass
 * (map colors, cards panel, score bar) reads from here; every API call
 * result gets written here first, then `render()` (in main.js) redraws
 * everything from scratch. That keeps the UI from drifting out of sync
 * with itself, at the cost of a full re-render on every change - fine at
 * this game's scale (~60 cards, a handful of teams).
 */
const State = {
  gameId: null,
  myTeamColor: null,
  cards: [], // raw response from GET /{game}/{team}/cards
  teams: [], // raw response from GET /{game}/teams

  init(gameId, myTeamColor) {
    this.gameId = gameId;
    this.myTeamColor = myTeamColor;
  },

  setCards(cards) {
    this.cards = cards;
  },

  setTeams(teams) {
    this.teams = teams;
  },

  /** Card object for a gemeente/wild-card name, or undefined if we can't see it. */
  cardByName(name) {
    return this.cards.find((c) => c.card_name === name);
  },

  cardById(cardId) {
    return this.cards.find((c) => c.card_id === cardId);
  },

  /** Cards shown in the bottom cards panel: public board + our own visible private cards. */
  panelCards() {
    return this.cards
      .filter(
        (c) =>
          c.card_state === "OnPublicBoard" ||
          (c.card_state === "OnPrivateBoard" && c.private_board_team === this.myTeamColor)
      )
      .sort((a, b) => {
        // First sort on public vs private cards (public cards are shown first)
        if (a.card_state === "OnPublicBoard" && b.card_state === "OnPrivateBoard") {
          return -1;
        } else if (a.card_state === "OnPrivateBoard" && b.card_state === "OnPublicBoard") {
          return 1;
        }
        // Then sort alphabetically
        return a.card_name.localeCompare(b.card_name)
      });
  },

  /** Current public-board cards, for the discard picker. */
  publicBoardCards() {
    return this.cards
      .filter((c) => c.card_state === "OnPublicBoard")
      .sort((a, b) => a.card_name.localeCompare(b.card_name));
  },

  myTeam() {
    return this.teams.find((t) => t.team_color === this.myTeamColor);
  },

  canDiscard() {
    const team = this.myTeam();
    return Boolean(team && team.can_discard_card);
  },

  /** Names of gemeentes claimed by anyone - always complete, since Claimed cards are visible to every team. */
  claimedGemeenteNames() {
    return new Set(
      this.cards.filter((c) => c.card_state === "Claimed" && !c.is_wild_card).map((c) => c.card_name)
    );
  },

  /** Unclaimed regular gemeentes, for the wild-card target dropdown. */
  unclaimedGemeentes() {
    const claimed = this.claimedGemeenteNames();
    return CONFIG.GEMEENTES.filter((name) => !claimed.has(name));
  },

  /**
   * Score per team color: number of (non-wild) gemeentes claimed.
   * Deliberately factored out so it can be swapped for a connected-
   * component count later without touching any rendering code - that
   * version will need a gemeente adjacency graph we don't have yet.
   */
  scores() {
    const byColor = {};
    for (const team of this.teams) byColor[team.team_color] = 0;
    for (const card of this.cards) {
      if (card.card_state === "Claimed" && !card.is_wild_card && card.claimed_team) {
        byColor[card.claimed_team] = (byColor[card.claimed_team] || 0) + 1;
      }
    }
    return byColor;
  },
};
