/**
 * Join page (index.html): pick a game and a team, then open the board.
 *
 * Loads only config.js + api.js - none of the board modules, which all
 * assume the board's DOM. Nodes are built with createElement/textContent
 * rather than innerHTML, so escapeHtml (which lives in ui.js) isn't
 * needed here either.
 */

// The game whose teams are currently being fetched. A slow response must
// not paint over a game the user has since switched away from.
let pendingTeamsFor = null;
let selectedTeamColor = null;

async function initJoin() {
  const gameSelect = document.getElementById("join-game");
  const remembered = readRemembered();

  gameSelect.replaceChildren(makeOption("", "Loading games..."));
  gameSelect.addEventListener("change", () =>
    loadTeams(gameSelect.value, null),
  );
  document.getElementById("join-btn").addEventListener("click", openBoard);
  // The code is deliberately never remembered, unlike the game and team:
  // it's the one thing that says you're on this team rather than another.
  document
    .getElementById("join-token")
    .addEventListener("input", updateJoinState);

  // Not awaited: the shortcut is a bonus, and the pickers below
  // shouldn't wait on a request that's allowed to come back "no".
  offerResume(remembered.game, remembered.team);

  let games;
  try {
    games = await Api.getGames();
  } catch (err) {
    gameSelect.replaceChildren(makeOption("", "Couldn't load games"));
    showJoinError(err.message);
    return;
  }

  if (games.length === 0) {
    gameSelect.replaceChildren(makeOption("", "No games yet"));
    showJoinError("No games yet. Create one to get started.");
    return;
  }

  renderGameOptions(games, remembered.game);

  // Pre-selecting a remembered game doesn't fire a change event, so pull
  // its teams (and the remembered colour) in by hand.
  if (gameSelect.value) {
    await loadTeams(gameSelect.value, remembered.team);
  }
}

function renderGameOptions(games, rememberedGame) {
  const select = document.getElementById("join-game");

  select.replaceChildren(makeOption("", "Choose a game..."));
  for (const game of games) {
    const teams = `${game.team_count} ${game.team_count === 1 ? "team" : "teams"}`;
    select.appendChild(makeOption(game.game_id, `${game.game_id} - ${teams}`));
  }

  const isStillListed = games.some((game) => game.game_id === rememberedGame);
  select.value = isStillListed ? rememberedGame : "";
  select.disabled = false;
}

// ---------------------------------------------------------------------
// Resume
// ---------------------------------------------------------------------

/**
 * Offers the board straight back to whoever is still signed in.
 *
 * The token sits in an HttpOnly cookie, so this page can neither read it
 * nor work out which team it belongs to. The remembered pick says which
 * game and team to ask about, and `GET /{game}/{team}/session` - the
 * same check every board request goes through - answers whether the
 * cookie still signs you in as them.
 *
 * Anything other than a yes just means no shortcut: no cookie, a cookie
 * for a different team, a game that's been deleted. The form below is
 * already the answer to all of those, so none of them is worth an error
 * banner.
 */
async function offerResume(gameId, teamColor) {
  if (!gameId || !teamColor) return;

  let team;
  try {
    team = await Api.getSession(gameId, teamColor);
  } catch (_) {
    return;
  }

  document.getElementById("join-resume-btn").textContent =
    `Continue as ${team.team_name}`;
  document.getElementById("join-resume-hint").textContent =
    `Still signed in to ${gameId}. Or pick a game and team below.`;
  document
    .getElementById("join-resume-btn")
    .addEventListener("click", () => openBoardFor(gameId, teamColor));
  document.getElementById("join-resume").hidden = false;
}

/** Fetches and renders the teams of `gameId`, selecting `preferredColor` if it's one of them. */
async function loadTeams(gameId, preferredColor) {
  const list = document.getElementById("join-teams");

  pendingTeamsFor = gameId;
  selectTeam(null);
  hideJoinError();
  list.replaceChildren();

  if (!gameId) return;
  list.replaceChildren(makeHint("Loading teams..."));

  let teams;
  try {
    teams = await Api.getTeams(gameId);
  } catch (err) {
    if (pendingTeamsFor !== gameId) return;
    list.replaceChildren();
    showJoinError(err.message);
    return;
  }
  if (pendingTeamsFor !== gameId) return;

  list.replaceChildren(...teams.map(makeTeamButton));
  if (teams.some((team) => team.team_color === preferredColor)) {
    selectTeam(preferredColor);
  }
}

/** Highlights one team button (or none, for `null`) and gates the join button. */
function selectTeam(teamColor) {
  selectedTeamColor = teamColor;

  for (const button of document.querySelectorAll(
    "#join-teams .discard-option",
  )) {
    const isSelected = button.dataset.teamColor === teamColor;
    button.classList.toggle("discard-option--selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  }

  updateJoinState();
}

/** The typed code, normalised to the shape the backend generated. */
function joinToken() {
  return document.getElementById("join-token").value.trim().toUpperCase();
}

/** Enables the join button only once there's a game, a team and a code. */
function updateJoinState() {
  const gameId = document.getElementById("join-game").value;
  document.getElementById("join-btn").disabled =
    !gameId || !selectedTeamColor || !joinToken();
}

/**
 * Trades the code for the cookie before opening the board.
 *
 * Logging in here rather than letting the board discover a bad code
 * keeps the error where it can be fixed - the field is right there - and
 * means the board is only ever reached by a team that can actually load
 * it.
 */
async function openBoard() {
  const gameId = document.getElementById("join-game").value;
  if (!gameId || !selectedTeamColor) return;

  const button = document.getElementById("join-btn");
  button.disabled = true;
  button.textContent = "Joining...";
  hideJoinError();

  try {
    await Api.login(gameId, selectedTeamColor, joinToken());
  } catch (err) {
    showJoinError(err.message);
    button.textContent = "Open board";
    updateJoinState();
    return;
  }

  writeRemembered(gameId, selectedTeamColor);
  openBoardFor(gameId, selectedTeamColor);
}

/** The board's URL shape, shared by joining and resuming. */
function openBoardFor(gameId, teamColor) {
  window.location.href = `board.html?game=${encodeURIComponent(
    gameId,
  )}&team=${encodeURIComponent(teamColor)}`;
}

// ---------------------------------------------------------------------
// Small builders
// ---------------------------------------------------------------------

function makeOption(value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function makeHint(text) {
  const hint = document.createElement("p");
  hint.className = "join__hint";
  hint.textContent = text;
  return hint;
}

function makeTeamButton(team) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "discard-option";
  button.dataset.teamColor = team.team_color;
  button.setAttribute("aria-pressed", "false");

  const row = document.createElement("span");
  row.className = "join-team";

  const dot = document.createElement("span");
  dot.className = "join-team__dot";
  dot.style.background = CONFIG.TEAM_COLORS[team.team_color] || "#999";

  const name = document.createElement("span");
  name.textContent = team.team_name;

  row.append(dot, name);
  button.appendChild(row);
  button.addEventListener("click", () => selectTeam(team.team_color));
  return button;
}

// ---------------------------------------------------------------------
// Error banner
// ---------------------------------------------------------------------

function showJoinError(message) {
  const el = document.getElementById("join-error");
  el.textContent = message;
  el.hidden = false;
}

function hideJoinError() {
  document.getElementById("join-error").hidden = true;
}

document.addEventListener("DOMContentLoaded", initJoin);
