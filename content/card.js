// The hover/focus card. Dynamically imported once by content.js. Renders
// into a single reusable Shadow DOM host appended to document.body, so
// the host page's CSS can never bleed into the card (and vice versa).
//
// Interaction model (see MVP spec's "Underlines and hover behavior"):
//  - Hovering a name starts a 350ms "open" timer (cancelled on quick
//    pass-over, so nothing flickers).
//  - The card stays open while the pointer/focus is on the name OR the
//    card, and closes 300ms after leaving both — long enough to move the
//    mouse from the name into the card.
//  - Keyboard focus on a name opens the card immediately; Tab moves focus
//    into the card's buttons, Shift+Tab from the first one returns focus
//    to the name, and Esc closes the card and refocuses the name from
//    anywhere.
//
// All dynamic/external text (names, committee/employer labels) is written
// via textContent, never innerHTML — the static chrome around it is the
// only innerHTML, and it contains no interpolated data. This matters more
// once Milestone 4 plugs in live FEC API text.

const HOVER_DELAY_MS = 350;
const CLOSE_DELAY_MS = 300;
const VIEWPORT_MARGIN = 8;

const PARTY_COLORS = {
  Democrat: "#2a5fa8",
  Republican: "#b23b3b",
  Independent: "#6b6b6b",
};

const CARD_STYLES = `
  :host { all: initial; }
  .card {
    box-sizing: border-box;
    width: 320px;
    max-width: calc(100vw - ${VIEWPORT_MARGIN * 2}px);
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    line-height: 1.45;
    color: #1a1a1a;
    background: #ffffff;
    border: 1px solid #d8d8d8;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    padding: 12px 14px;
  }
  .header { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; margin-bottom: 2px; }
  .name { font-weight: 600; font-size: 14px; }
  .party-badge {
    font-size: 11px;
    font-weight: 600;
    color: #fff;
    border-radius: 3px;
    padding: 0 5px;
  }
  .subline { color: #555; font-size: 12px; margin-bottom: 8px; }
  .totals { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; margin-bottom: 8px; }
  .totals .label { color: #666; font-size: 11px; }
  .totals .value { font-weight: 600; }
  .split { font-size: 12px; color: #333; margin-bottom: 10px; }
  .split-row { display: flex; justify-content: space-between; padding: 1px 0; }
  h4 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: #777;
    margin: 10px 0 4px;
  }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; }
  .funder-link {
    color: #1a3a5c;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
    text-align: left;
  }
  .as-of { font-size: 11px; color: #888; margin-top: 10px; }
  .actions { display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
  .actions a, .actions button {
    font: inherit;
    font-size: 12px;
    color: #1a3a5c;
    background: #f1f5f9;
    border: 1px solid #d3dce3;
    border-radius: 4px;
    padding: 4px 8px;
    text-decoration: none;
    cursor: pointer;
  }
  .actions a:focus-visible, .actions button:focus-visible, .close-btn:focus-visible {
    outline: 2px solid #2a5fa8;
    outline-offset: 1px;
  }
  .close-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    color: #777;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    border-radius: 3px;
  }
  .close-btn:hover { background: #eee; }
  .state-message { color: #555; padding: 4px 0; }
`;

let hostEl = null;
let shadowRoot = null;
let cardEl = null;
let bodyEl = null;

let currentSpan = null;
let isCardOpen = false;
let openTimer = null;
let closeTimer = null;
let requestToken = 0;

export function initHoverCard() {
  document.addEventListener("mouseover", onMouseOver);
  document.addEventListener("mouseout", onMouseOut);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
  document.addEventListener("keydown", onKeyDown);
  // A scrolling page would leave a position:fixed card visually stranded
  // next to text that's moved; closing on scroll is the simple, standard
  // fix (most browser tooltips/popovers do the same). Scroll events don't
  // bubble, so this has to be a capturing listener to also catch scrolling
  // inside an inner container (e.g. a sidebar), not just the window.
  document.addEventListener("scroll", () => isCardOpen && closeCard(), { capture: true, passive: true });
}

function matchSpan(target) {
  return target?.closest?.(".fundprint-match") || null;
}

function onMouseOver(event) {
  const span = matchSpan(event.target);
  if (span) {
    cancelCloseTimer();
    if (isCardOpen && currentSpan === span) return;
    cancelOpenTimer();
    openTimer = setTimeout(() => openCardFor(span), HOVER_DELAY_MS);
  } else if (event.target === hostEl) {
    cancelCloseTimer();
  }
}

function onMouseOut(event) {
  const span = matchSpan(event.target);
  if (span) {
    const related = event.relatedTarget;
    if (!related || !span.contains(related)) {
      cancelOpenTimer();
      scheduleClose();
    }
  } else if (event.target === hostEl) {
    scheduleClose();
  }
}

function onFocusIn(event) {
  const span = matchSpan(event.target);
  if (span) {
    cancelCloseTimer();
    cancelOpenTimer();
    openCardFor(span);
  } else if (event.target === hostEl) {
    cancelCloseTimer();
  }
}

function onFocusOut(event) {
  const span = matchSpan(event.target);
  if (span || event.target === hostEl) {
    scheduleClose();
  }
}

function onKeyDown(event) {
  if (!isCardOpen) return;

  if (event.key === "Escape") {
    event.preventDefault();
    const toRefocus = currentSpan;
    closeCard();
    toRefocus?.focus();
    return;
  }

  if (event.key === "Tab") {
    const focusables = getCardFocusables();
    // When focus is inside an open shadow root, document.activeElement
    // (from outside) reports the shadow HOST, not the actual focused
    // descendant — shadowRoot.activeElement is needed to see which card
    // element really has focus.
    const activeInCard = document.activeElement === hostEl ? shadowRoot.activeElement : null;

    if (document.activeElement === currentSpan && !event.shiftKey && focusables.length > 0) {
      event.preventDefault();
      focusables[0].focus();
    } else if (event.shiftKey && focusables.length > 0 && activeInCard === focusables[0]) {
      event.preventDefault();
      currentSpan?.focus();
    }
  }
}

function cancelOpenTimer() {
  clearTimeout(openTimer);
  openTimer = null;
}
function cancelCloseTimer() {
  clearTimeout(closeTimer);
  closeTimer = null;
}
function scheduleClose() {
  cancelCloseTimer();
  closeTimer = setTimeout(closeCard, CLOSE_DELAY_MS);
}

function ensureCardHost() {
  if (hostEl) return;

  hostEl = document.createElement("div");
  hostEl.id = "fundprint-card-host";
  hostEl.style.position = "fixed";
  hostEl.style.zIndex = "2147483647";
  hostEl.style.display = "none";
  document.body.appendChild(hostEl);

  shadowRoot = hostEl.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CARD_STYLES;
  shadowRoot.appendChild(style);

  cardEl = document.createElement("div");
  cardEl.className = "card";
  cardEl.setAttribute("role", "dialog");
  cardEl.setAttribute("aria-label", "Campaign funding summary");

  const closeBtn = document.createElement("button");
  closeBtn.className = "close-btn";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => {
    const toRefocus = currentSpan;
    closeCard();
    toRefocus?.focus();
  });
  cardEl.style.position = "relative";
  cardEl.appendChild(closeBtn);

  bodyEl = document.createElement("div");
  cardEl.appendChild(bodyEl);

  shadowRoot.appendChild(cardEl);
}

function getCardFocusables() {
  if (!shadowRoot) return [];
  return [...shadowRoot.querySelectorAll("button, a[href]")];
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.appendChild(child);
  return node;
}

function formatMoney(amount) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    amount
  );
}

function partyBadge(party) {
  const short = party === "Democrat" ? "D" : party === "Republican" ? "R" : party === "Independent" ? "I" : "?";
  const badge = el("span", { className: "party-badge", text: short });
  badge.style.background = PARTY_COLORS[party] || "#6b6b6b";
  badge.title = party || "Unknown party";
  return badge;
}

function officeLabel(summary) {
  if (summary.chamber === "sen") return `U.S. Senate — ${summary.state}`;
  return `U.S. House — ${summary.state}${summary.district != null ? `-${summary.district}` : ""}`;
}

function renderLoading(name) {
  bodyEl.replaceChildren(
    el("div", { className: "header" }, [el("span", { className: "name", text: name })]),
    el("p", { className: "state-message", text: "Loading funding summary…" })
  );
}

function renderStateMessage(name, message, { openOptionsButton = false } = {}) {
  const children = [
    el("div", { className: "header" }, [el("span", { className: "name", text: name })]),
    el("p", { className: "state-message", text: message }),
  ];
  if (openOptionsButton) {
    const btn = el("button", { text: "Open options" });
    btn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "FUNDPRINT_OPEN_OPTIONS" });
    });
    children.push(el("div", { className: "actions" }, [btn]));
  }
  bodyEl.replaceChildren(...children);
}

function renderNotFound(name) {
  renderStateMessage(name, "No funding data found for this person.");
}

function renderError(name) {
  renderStateMessage(name, "Something went wrong loading this summary. Try again shortly.");
}

function renderRateLimited(name) {
  renderStateMessage(name, "The FEC API's rate limit was reached. Try again in a few minutes.");
}

function renderMissingApiKey(name) {
  renderStateMessage(name, "Add your free FEC API key in Fundprint's options to see funding data.", {
    openOptionsButton: true,
  });
}

function renderInvalidApiKey(name) {
  renderStateMessage(name, "Your FEC API key looks invalid. Check it in Fundprint's options.", {
    openOptionsButton: true,
  });
}

function renderSummary(summary) {
  const children = [];

  children.push(
    el("div", { className: "header" }, [el("span", { className: "name", text: summary.name }), partyBadge(summary.party)]),
    el("div", { className: "subline", text: `${officeLabel(summary)} · ${summary.cycle} cycle` })
  );

  const totals = el("div", { className: "totals" });
  const totalPairs = [
    ["Total raised", summary.totals.raised],
    ["Cash on hand", summary.totals.cashOnHand],
  ];
  for (const [label, value] of totalPairs) {
    totals.appendChild(el("span", { className: "label", text: label }));
    totals.appendChild(el("span", { className: "value", text: formatMoney(value) }));
  }
  children.push(totals);

  const split = el("div", { className: "split" });
  const splitRows = [
    ["Individuals", summary.totals.fromIndividuals],
    ["PACs & committees", summary.totals.fromCommittees],
    ["Self-funding", summary.totals.selfFunding],
  ];
  for (const [label, value] of splitRows) {
    split.appendChild(
      el("div", { className: "split-row" }, [el("span", { text: label }), el("span", { text: formatMoney(value) })])
    );
  }
  children.push(split);

  children.push(el("h4", { text: "Top contributing committees" }));
  if (summary.topCommitteesUnavailable) {
    children.push(el("p", { className: "state-message", text: "Temporarily unavailable." }));
  } else if (summary.topCommittees?.length) {
    const list = el("ul");
    for (const committee of summary.topCommittees) {
      const btn = el("button", { className: "funder-link", text: committee.name });
      btn.addEventListener("click", () => openFunderDetail(committee.id));
      list.appendChild(el("li", {}, [btn, el("span", { text: formatMoney(committee.amount) })]));
    }
    children.push(list);
  } else {
    children.push(el("p", { className: "state-message", text: "None reported this cycle." }));
  }

  // Deliberately plain text, not clickable: we group individual donors by
  // employer only (never show names), and there's no further "funder"
  // page for an employer bucket the way there is for a PAC.
  children.push(el("h4", { text: "Top employers of individual donors" }));
  if (summary.topEmployersUnavailable) {
    children.push(el("p", { className: "state-message", text: "Temporarily unavailable." }));
  } else if (summary.topEmployers?.length) {
    const list = el("ul");
    for (const employer of summary.topEmployers) {
      list.appendChild(
        el("li", {}, [el("span", { text: employer.employer }), el("span", { text: formatMoney(employer.amount) })])
      );
    }
    children.push(list);
  } else {
    children.push(el("p", { className: "state-message", text: "None itemized this cycle." }));
  }

  children.push(el("div", { className: "as-of", text: `Data as of ${summary.asOfDate}` }));

  const actions = el("div", { className: "actions" });
  const fullBreakdownLink = el("a", {
    href: chrome.runtime.getURL(`detail/candidate.html?id=${encodeURIComponent(summary.id)}`),
    target: "_blank",
    rel: "noopener",
    text: "Full breakdown",
  });
  actions.appendChild(fullBreakdownLink);
  if (summary.fecCandidateUrl) {
    actions.appendChild(
      el("a", { href: summary.fecCandidateUrl, target: "_blank", rel: "noopener", text: "View on FEC.gov" })
    );
  }
  children.push(actions);

  bodyEl.replaceChildren(...children);
}

function openFunderDetail(committeeId) {
  window.open(chrome.runtime.getURL(`detail/funder.html?id=${encodeURIComponent(committeeId)}`), "_blank", "noopener");
}

function positionCard(anchorRect) {
  hostEl.style.visibility = "hidden";
  hostEl.style.display = "block";
  const cardRect = hostEl.getBoundingClientRect();

  let top = anchorRect.bottom + VIEWPORT_MARGIN;
  if (top + cardRect.height > window.innerHeight) {
    const above = anchorRect.top - cardRect.height - VIEWPORT_MARGIN;
    top = above >= 0 ? above : VIEWPORT_MARGIN;
  }

  let left = anchorRect.left;
  if (left + cardRect.width > window.innerWidth - VIEWPORT_MARGIN) {
    left = window.innerWidth - cardRect.width - VIEWPORT_MARGIN;
  }
  if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

  hostEl.style.top = `${top}px`;
  hostEl.style.left = `${left}px`;
  hostEl.style.visibility = "visible";
}

async function openCardFor(span) {
  ensureCardHost();
  currentSpan = span;
  isCardOpen = true;
  const token = ++requestToken;

  const name = span.dataset.fundprintName || span.textContent;
  renderLoading(name);
  positionCard(span.getBoundingClientRect());

  const ids = (span.dataset.fundprintIds || "").split(",").filter(Boolean);
  // Milestone 3 scope: when a name is ambiguous (multiple ids), just use
  // the first one. A proper disambiguation picker is a known follow-up
  // (see MVP spec's name-matching edge cases) before this ships broadly.
  const id = ids[0];
  if (!id) {
    renderNotFound(name);
    return;
  }

  let summary;
  try {
    summary = await chrome.runtime.sendMessage({ type: "FUNDPRINT_GET_SUMMARY", id });
  } catch {
    if (token === requestToken) renderError(name);
    return;
  }

  if (token !== requestToken) return; // user moved on before this resolved
  if (!summary || summary.notFound) {
    renderNotFound(name);
  } else if (summary.missingApiKey) {
    renderMissingApiKey(name);
  } else if (summary.invalidApiKey) {
    renderInvalidApiKey(name);
  } else if (summary.rateLimited) {
    renderRateLimited(name);
  } else if (summary.error) {
    renderError(name);
  } else {
    renderSummary(summary);
    positionCard(span.getBoundingClientRect());
  }
}

function closeCard() {
  isCardOpen = false;
  currentSpan = null;
  cancelOpenTimer();
  cancelCloseTimer();
  if (hostEl) hostEl.style.display = "none";
}
