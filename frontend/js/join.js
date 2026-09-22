/**
 * Join page (index.html): pick a game and a team, then open the board.
 *
 * Loads only config.js + api.js - none of the board modules, which all
 * assume the board's DOM. Nodes are built with createElement/textContent
 * rather than innerHTML, so escapeHtml (which lives in ui.js) isn't
 * needed here either.
 */

// Remembers the last pick so returning players don't have to hunt for
// their game again. Only ever used to pre-select the form, never to skip
// it - switching teams mid-game has to stay possible.
const STORAGE_KEY = "gemeentejacht:last-join";

// The game whose teams are currently being fetched. A slow response must
// not paint over a game the user has since switched away from.
let pendingTeamsFor = null;
let selectedTeamColor = null;

async function initJoin() {
  const gameSelect = document.getElementById("join-game");
  const remembered = readRemembered();

  gameSelect.replaceChildren(makeOption("", "Loading games..."));
  gameSelect.addEventListener("change", () => loadTeams(gameSelect.value, null));
  document.getElementById("join-btn").addEventListener("click", openBoard);

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
    showJoinError(
      "No games yet. Create one with POST /{game_id}/create, then reload this page."
    );
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

  for (const button of document.querySelectorAll("#join-teams .discard-option")) {
    const isSelected = button.dataset.teamColor === teamColor;
    button.classList.toggle("discard-option--selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  }

  const gameId = document.getElementById("join-game").value;
  document.getElementById("join-btn").disabled = !gameId || !teamColor;
}

function openBoard() {
  const gameId = document.getElementById("join-game").value;
  if (!gameId || !selectedTeamColor) return;

  writeRemembered(gameId, selectedTeamColor);
  window.location.href = `board.html?game=${encodeURIComponent(
    gameId
  )}&team=${encodeURIComponent(selectedTeamColor)}`;
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
// Error banner + remembered pick
// ---------------------------------------------------------------------

function showJoinError(message) {
  const el = document.getElementById("join-error");
  el.textContent = message;
  el.hidden = false;
}

function hideJoinError() {
  document.getElementById("join-error").hidden = true;
}

/** Storage throws in Safari private mode, so both helpers are best-effort. */
function readRemembered() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY)) || {};
  } catch (_) {
    return {};
  }
}

function writeRemembered(gameId, teamColor) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ game: gameId, team: teamColor })
    );
  } catch (_) {
    // Not being able to remember the pick isn't worth interrupting the join.
  }
}

document.addEventListener("DOMContentLoaded", initJoin);
