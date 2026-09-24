/**
 * Everything that touches the DOM outside the map itself: the cards
 * panel, score bar, the claim/discard modal, and toast messages.
 *
 * The modal is a tiny state machine (`Modal.view` + `Modal.context`) so
 * the claim flow (detail -> confirm -> result) and the discard flow
 * (pick -> confirm -> result) can share one overlay and one render
 * function instead of five separate popups.
 *
 * The discard flow is the one view nobody opens on purpose: the rules
 * make a discard mandatory after a claim, and the server refuses the
 * next claim until it happens, so `Modal.blocking` turns the overlay
 * into a full-screen wall. The one way past it is peeking (below), which
 * trades the wall for a read-only board; only a completed discard puts
 * the game back in the team's hands.
 */

/**
 * Set while the team is looking at the board instead of the discard
 * screen they still owe. Everything the board can normally do is off in
 * this mode - the deck is hidden, claiming is refused - so the only
 * thing peeking buys is a look at where the gemeentes stand, which is
 * exactly what you want before choosing what to throw away.
 */
let discardPeek = false;

const UI = {
  init() {
    document
      .getElementById("cards-panel-handle")
      .addEventListener("click", () => {
        document.getElementById("cards-panel").classList.toggle("expanded");
      });

    document.getElementById("modal-overlay").addEventListener("click", (e) => {
      if (e.target.id === "modal-overlay") Modal.close();
    });

    document
      .getElementById("discard-nag-btn")
      .addEventListener("click", () => UI.resumeDiscard());

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      // Escape can't clear the debt, only step aside from it.
      if (Modal.blocking) UI.peekBoard();
      else Modal.close();
    });
  },

  /** Redraw the cards panel and score bar from the current State. Call after every refresh. */
  render() {
    renderCardsPanel();
    renderScoreBar();
    syncDiscardState();
  },

  openCardModal(name) {
    const card = State.cardByName(name);
    if (!card) {
      UI.toast("That gemeente hasn't been revealed yet.");
      return;
    }
    Modal.showCardDetail(card);
  },

  /** Leave the discard screen for the read-only board behind it. */
  peekBoard() {
    discardPeek = true;
    Modal.blocking = false;
    Modal.close();
  },

  /** Back from the read-only board to the discard screen. */
  resumeDiscard() {
    discardPeek = false;
    Modal.showDiscardPick();
  },

  toast(message, tone = "info") {
    const container = document.getElementById("toast-container");
    const el = document.createElement("div");
    el.className = `toast toast--${tone}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.classList.add("toast--visible"), 10);
    setTimeout(() => {
      el.classList.remove("toast--visible");
      setTimeout(() => el.remove(), 250);
    }, 3200);
  },
};

// ---------------------------------------------------------------------
// Cards panel
// ---------------------------------------------------------------------

function renderCardsPanel() {
  const cards = State.panelCards();
  document.getElementById("cards-count").textContent =
    cards.length === 1 ? "1 card" : `${cards.length} cards`;

  const list = document.getElementById("cards-list");
  list.innerHTML = "";

  if (cards.length === 0) {
    const empty = document.createElement("p");
    empty.className = "cards-empty";
    empty.textContent = "No cards on the board yet. Try refreshing.";
    list.appendChild(empty);
    return;
  }

  for (const card of cards) {
    const isMine = card.card_state === "OnPrivateBoard";
    const button = document.createElement("button");
    button.type = "button";
    button.className = `playing-card${isMine ? " playing-card--private" : ""}${
      card.is_wild_card ? " playing-card--wild" : ""
    }`;
    button.setAttribute("aria-label", `Open ${card.card_name}`);
    if (isMine) {
      team_color = CONFIG.TEAM_COLORS[State.myTeamColor];
      button.setAttribute("style", `background-color: ${team_color}52;`);
    }
    button.innerHTML = `
      <span class="playing-card__name">${escapeHtml(card.card_name)}</span>
    `;
    button.addEventListener("click", () => Modal.showCardDetail(card));
    list.appendChild(button);
  }
}

// ---------------------------------------------------------------------
// Score bar
// ---------------------------------------------------------------------

function renderScoreBar() {
  const scores = State.scores();
  const container = document.getElementById("score-chips");
  container.innerHTML = "";

  for (const team of State.teams) {
    const score = scores[team.team_color] || { connected: 0, total: 0 };
    const chip = document.createElement("div");
    chip.className = "score-chip";
    chip.title = "Team score (total claimed)";
    chip.innerHTML = `
      <span class="score-chip__dot" style="background:${CONFIG.TEAM_COLORS[team.team_color] || "#999"}"></span>
      <span class="score-chip__name">${escapeHtml(team.team_name)}</span>
      <span class="score-chip__value">${score.connected}</span>
      <span class="score-chip__total">(${score.total})</span>
    `;
    container.appendChild(chip);
  }
}

/**
 * Puts the whole app in (or out of) "you owe a discard" mode after every
 * refresh: deck hidden, return bar shown, discard screen up unless the
 * team stepped aside to read the board.
 *
 * A pending discard usually arrives while the claim result is still on
 * screen, so an open modal is left alone - `Modal.close()` picks the
 * discard up as soon as that modal is dismissed. The release case covers
 * a teammate on another phone doing the discard for us: the wall comes
 * down instead of sitting there waiting for a discard the server would
 * now reject.
 */
function syncDiscardState() {
  const owesDiscard = State.canDiscard();

  // The deck is what the team would be tempted to shop around in; the
  // map and scores are what they need to choose well, so only the panel
  // goes away.
  document.getElementById("cards-panel").hidden = owesDiscard;
  document.getElementById("discard-nag").hidden = !owesDiscard;
  document.getElementById("app").classList.toggle("app--no-deck", owesDiscard);

  if (!owesDiscard) {
    discardPeek = false;
    if (Modal.blocking) {
      Modal.blocking = false;
      Modal.close();
    }
    return;
  }

  if (!Modal.view && !discardPeek) Modal.showDiscardPick();
}

// ---------------------------------------------------------------------
// Modal: claim + discard flows
// ---------------------------------------------------------------------

const Modal = {
  view: null,
  context: {},
  /**
   * While set, the overlay is full-screen and `close()` does nothing -
   * the only exits are finishing the discard or peeking, and both clear
   * this flag themselves rather than going through `close()`.
   */
  blocking: false,

  showCardDetail(card) {
    this.view = "detail";
    this.context = { card, targetName: null, error: null };
    this._open();
  },

  showConfirm() {
    this.view = "confirm";
    this.context.error = null;
    this._render();
  },

  showDiscardPick() {
    this.view = "discard-pick";
    this.context = { selected: null, error: null };
    this.blocking = true;
    this._open();
  },

  showDiscardConfirm() {
    this.view = "discard-confirm";
    this.context.error = null;
    this._render();
  },

  showResult(kind, newCards) {
    this.view = "result";
    this.context = { kind, newCards };
    // The discard is settled by the time its result shows, so the wall
    // comes down here - and `_open()` rather than `_render()` because
    // the refresh behind the discard already closed the overlay.
    this.blocking = false;
    this._open();
  },

  close() {
    if (this.blocking) return;

    this.view = null;
    this.context = {};
    document.getElementById("modal-overlay").hidden = true;

    // A claim hands out a discard while its own result modal is still
    // up; this is where that queued discard finally gets the screen.
    // Peeking is the one case where closing a modal is meant to land on
    // the board rather than back on the discard screen.
    if (State.canDiscard() && !discardPeek) this.showDiscardPick();
  },

  _open() {
    document.getElementById("modal-overlay").hidden = false;
    this._render();
  },

  _render() {
    document
      .getElementById("modal-overlay")
      .classList.toggle("modal-overlay--blocking", this.blocking);

    const content = document.getElementById("modal-content");
    content.innerHTML = "";
    content.appendChild(this._buildView());
    const firstFocusable = content.querySelector("button, select");
    if (firstFocusable) firstFocusable.focus();
  },

  _buildView() {
    switch (this.view) {
      case "detail":
        return buildDetailView(this.context);
      case "confirm":
        return buildConfirmView(this.context);
      case "discard-pick":
        return buildDiscardPickView(this.context);
      case "discard-confirm":
        return buildDiscardConfirmView(this.context);
      case "result":
        return buildResultView(this.context);
      default:
        return document.createElement("div");
    }
  },
};

function buildDetailView(context) {
  const { card, error } = context;
  const wrap = document.createElement("div");

  const claimedTag =
    card.card_state === "Claimed"
      ? `<p class="modal-tag">Claimed by ${escapeHtml(teamName(card.claimed_team))}</p>`
      : "";

  wrap.innerHTML = `
    <div class="modal-header">
      <h2>${escapeHtml(card.card_name)}${card.is_wild_card ? ' <span class="modal-badge">Wild card</span>' : ""}</h2>
      <button type="button" class="modal-close" aria-label="Close">&times;</button>
    </div>
    ${claimedTag}
    ${card.challenge_title ? `<p class="modal-challenge-title">${escapeHtml(card.challenge_title)}</p>` : ""}
    <p class="modal-description">${
      card.challenge_description
        ? escapeHtml(card.challenge_description)
        : "No challenge text has been added for this card yet."
    }</p>
    ${error ? `<p class="modal-error">${escapeHtml(error)}</p>` : ""}
  `;

  wrap
    .querySelector(".modal-close")
    .addEventListener("click", () => Modal.close());

  // Peeking at the board with a discard outstanding: the card is still
  // worth reading, but the server would reject a claim anyway, so the
  // whole claim block stays out rather than failing on tap.
  if (card.card_state !== "Claimed" && State.canDiscard()) {
    const note = document.createElement("p");
    note.className = "modal-tag";
    note.textContent = "Discard a card first to claim anything else.";
    wrap.appendChild(note);
    return wrap;
  }

  if (card.card_state !== "Claimed") {
    const actions = document.createElement("div");
    actions.className = "modal-actions";

    let targetSelect = null;
    if (card.is_wild_card) {
      const field = document.createElement("div");
      field.className = "modal-field";
      const label = document.createElement("label");
      label.textContent = "Claim which gemeente with this wild card?";
      label.htmlFor = "wildcard-target";
      targetSelect = document.createElement("select");
      targetSelect.id = "wildcard-target";
      targetSelect.innerHTML =
        `<option value="">Choose a gemeente...</option>` +
        State.unclaimedGemeentes()
          .map(
            (name) =>
              `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`,
          )
          .join("");
      field.appendChild(label);
      field.appendChild(targetSelect);
      wrap.appendChild(field);
    }

    const completeBtn = document.createElement("button");
    completeBtn.type = "button";
    completeBtn.className = "btn btn--primary";
    completeBtn.textContent = "Challenge complete!";
    completeBtn.disabled = card.is_wild_card; // needs a target picked first

    if (targetSelect) {
      targetSelect.addEventListener("change", () => {
        context.targetName = targetSelect.value || null;
        completeBtn.disabled = !context.targetName;
      });
    }

    completeBtn.addEventListener("click", () => Modal.showConfirm());
    actions.appendChild(completeBtn);
    wrap.appendChild(actions);
  }

  return wrap;
}

function buildConfirmView(context) {
  const { card, targetName, error } = context;
  const wrap = document.createElement("div");

  const question = card.is_wild_card
    ? `Use the wild card to claim <strong>${escapeHtml(targetName)}</strong>?`
    : `Mark the <strong>${escapeHtml(card.card_name)}</strong> challenge as complete?`;

  wrap.innerHTML = `
    <div class="modal-header">
      <h2>Are you sure?</h2>
      <button type="button" class="modal-close" aria-label="Close">&times;</button>
    </div>
    <p class="modal-description">${question}</p>
    ${error ? `<p class="modal-error">${escapeHtml(error)}</p>` : ""}
  `;
  wrap
    .querySelector(".modal-close")
    .addEventListener("click", () => Modal.close());

  const actions = document.createElement("div");
  actions.className = "modal-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn--ghost";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => Modal.showCardDetail(card));

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "btn btn--primary";
  confirmBtn.textContent = "Yes, confirm";
  confirmBtn.addEventListener("click", () =>
    performClaim(card, targetName, confirmBtn),
  );

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  wrap.appendChild(actions);
  return wrap;
}

async function performClaim(card, targetName, triggerBtn) {
  triggerBtn.disabled = true;
  triggerBtn.textContent = "Claiming...";
  try {
    const targetId = card.is_wild_card ? gemeenteCardId(targetName) : null;
    const newCards = await Api.claimCard(
      State.gameId,
      State.myTeamColor,
      card.card_id,
      targetId,
    );
    await window.refreshAll();
    Modal.showResult("claim", newCards);
  } catch (err) {
    Modal.context.error = err.message;
    Modal.showConfirm();
  }
}

function buildDiscardPickView(context) {
  const { error } = context;
  const wrap = document.createElement("div");
  wrap.className = "discard-screen";
  const publicCards = State.publicBoardCards();

  wrap.innerHTML = `
    <p class="discard-screen__eyebrow">Before you play</p>
    <h2 class="discard-screen__title">Discard a card</h2>
    ${error ? `<p class="modal-error">${escapeHtml(error)}</p>` : ""}
  `;

  // Shouldn't happen - a claim replenishes the board it emptied - but a
  // blocking screen with nothing to click would brick the game, so leave
  // a way to refetch rather than a dead end.
  if (publicCards.length === 0) {
    const empty = document.createElement("p");
    empty.className = "modal-description";
    empty.textContent =
      "There are no cards on the public board right now. Refresh to look again.";
    wrap.appendChild(empty);

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "btn btn--ghost";
    refreshBtn.textContent = "Refresh";
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.disabled = true;
      await window.refreshAll();
      if (Modal.view === "discard-pick") Modal.showDiscardPick();
    });
    actions.appendChild(buildPeekButton());
    actions.appendChild(refreshBtn);
    wrap.appendChild(actions);
    return wrap;
  }

  const list = document.createElement("div");
  list.className = "discard-list";
  for (const card of publicCards) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "discard-option";
    option.textContent = card.card_name;
    option.addEventListener("click", () => {
      list
        .querySelectorAll(".discard-option")
        .forEach((el) => el.classList.remove("discard-option--selected"));
      option.classList.add("discard-option--selected");
      context.selected = card;
      discardBtn.disabled = false;
    });
    list.appendChild(option);
  }
  wrap.appendChild(list);

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const discardBtn = document.createElement("button");
  discardBtn.type = "button";
  discardBtn.className = "btn btn--danger";
  discardBtn.textContent = "Discard";
  discardBtn.disabled = true;
  discardBtn.addEventListener("click", () => Modal.showDiscardConfirm());
  actions.appendChild(buildPeekButton());
  actions.appendChild(discardBtn);
  wrap.appendChild(actions);

  return wrap;
}

/** The way out of the discard screen: the board, minus everything you can do to it. */
function buildPeekButton() {
  const peekBtn = document.createElement("button");
  peekBtn.type = "button";
  peekBtn.className = "btn btn--ghost";
  peekBtn.textContent = "View the board";
  peekBtn.addEventListener("click", () => UI.peekBoard());
  return peekBtn;
}

function buildDiscardConfirmView(context) {
  const { selected, error } = context;
  const wrap = document.createElement("div");
  wrap.className = "discard-screen discard-screen--centered";

  wrap.innerHTML = `
    <h2 class="discard-screen__title">Are you sure?</h2>
    <p class="modal-description">Discard <strong>${escapeHtml(selected.card_name)}</strong> and draw a new card onto the public board?</p>
    ${error ? `<p class="modal-error">${escapeHtml(error)}</p>` : ""}
  `;

  const actions = document.createElement("div");
  actions.className = "modal-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn--ghost";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => Modal.showDiscardPick());

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "btn btn--danger";
  confirmBtn.textContent = "Yes, discard";
  confirmBtn.addEventListener("click", () =>
    performDiscard(selected, confirmBtn),
  );

  actions.appendChild(cancelBtn);
  actions.appendChild(confirmBtn);
  wrap.appendChild(actions);
  return wrap;
}

async function performDiscard(card, triggerBtn) {
  triggerBtn.disabled = true;
  triggerBtn.textContent = "Discarding...";
  try {
    const newCard = await Api.discardCard(
      State.gameId,
      State.myTeamColor,
      card.card_id,
    );
    // The debt is paid server-side; clear it locally too, so a refresh
    // that fails right after can't leave the blocking screen stuck up.
    const team = State.myTeam();
    if (team) team.can_discard_card = false;
    await window.refreshAll();
    Modal.showResult("discard", newCard ? [newCard] : []);
  } catch (err) {
    Modal.context.error = err.message;
    Modal.showDiscardConfirm();
  }
}

function buildResultView(context) {
  const { kind, newCards } = context;
  const wrap = document.createElement("div");

  const heading = kind === "claim" ? "Challenge complete!" : "Card discarded";
  const cardsHtml =
    newCards && newCards.length > 0
      ? `<p class="modal-description">New card${newCards.length > 1 ? "s" : ""} added to the public board:</p>
         <ul class="modal-list">${newCards.map((c) => `<li>${escapeHtml(c.card_name)}</li>`).join("")}</ul>`
      : `<p class="modal-description">No new cards were drawn onto the public board.</p>`;

  wrap.innerHTML = `
    <div class="modal-header">
      <h2>${heading}</h2>
      <button type="button" class="modal-close" aria-label="Close">&times;</button>
    </div>
    ${cardsHtml}
  `;
  wrap
    .querySelector(".modal-close")
    .addEventListener("click", () => Modal.close());

  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const doneBtn = document.createElement("button");
  doneBtn.type = "button";
  doneBtn.className = "btn btn--primary";
  doneBtn.textContent = "Done";
  doneBtn.addEventListener("click", () => Modal.close());
  actions.appendChild(doneBtn);
  wrap.appendChild(actions);

  return wrap;
}

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

function teamName(teamColor) {
  const team = State.teams.find((t) => t.team_color === teamColor);
  return team ? team.team_name : teamColor;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}
