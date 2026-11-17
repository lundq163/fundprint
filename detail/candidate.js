// Candidate detail page. Opened in a new tab (from the hover card's
// "Full breakdown" link, or directly). Reads ?id=<bioguide id> from the
// URL and asks the background worker for the full breakdown.

const PARTY_COLORS = {
  Democrat: "#2a5fa8",
  Republican: "#b23b3b",
  Independent: "#6b6b6b",
};

const content = document.getElementById("content");

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
    amount || 0
  );
}

function partyBadge(party) {
  const short = party === "Democrat" ? "D" : party === "Republican" ? "R" : party === "Independent" ? "I" : "?";
  const badge = el("span", { className: "party-badge", text: short });
  badge.style.background = PARTY_COLORS[party] || "#6b6b6b";
  badge.title = party || "Unknown party";
  return badge;
}

function officeLabel(detail) {
  if (detail.chamber === "sen") return `U.S. Senate — ${detail.state}`;
  return `U.S. House — ${detail.state}${detail.district != null ? `-${detail.district}` : ""}`;
}

function stat(label, value) {
  return el("div", {}, [
    el("div", { className: "stat-label", text: label }),
    el("div", { className: "stat-value", text: formatMoney(value) }),
  ]);
}

function breakdownChart(totals) {
  const segments = [
    { key: "individuals", label: "Individuals", value: totals.fromIndividuals },
    { key: "committees", label: "PACs & committees", value: totals.fromCommittees + totals.fromPartyCommittees },
    { key: "self", label: "Self-funding", value: totals.selfFunding },
  ];
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;

  const bar = el("div", { className: "chart-bar" });
  for (const s of segments) {
    if (s.value <= 0) continue;
    const pct = (s.value / total) * 100;
    const seg = el("div", { className: `chart-segment series-${s.key}`, title: `${s.label}: ${formatMoney(s.value)}` });
    seg.style.width = `${pct}%`;
    bar.appendChild(seg);
  }

  const legend = el(
    "div",
    { className: "chart-legend" },
    segments.map((s) =>
      el("span", {}, [
        el("span", { className: `swatch series-${s.key}` }),
        el("span", { text: `${s.label}: ${formatMoney(s.value)}` }),
      ])
    )
  );

  return el("div", {}, [bar, legend]);
}

function detailList(items, { empty, render }) {
  if (!items.length) {
    return el("p", { className: "state-message", text: empty });
  }
  return el(
    "ul",
    { className: "detail-list" },
    items.map((item) => render(item))
  );
}

function openFunderDetail(committeeId) {
  window.open(chrome.runtime.getURL(`detail/funder.html?id=${encodeURIComponent(committeeId)}`), "_blank", "noopener");
}

function renderStateMessage(message, { openOptionsButton = false } = {}) {
  const messageEl = el("p", { className: "state-message", role: "status", tabindex: "-1", text: message });
  const children = [messageEl];
  if (openOptionsButton) {
    const btn = el("button", { text: "Open options" });
    btn.addEventListener("click", () => chrome.runtime.sendMessage({ type: "FUNDPRINT_OPEN_OPTIONS" }));
    children.push(el("div", { className: "actions" }, [btn]));
  }
  content.replaceChildren(...children);
  messageEl.focus();
}

function renderDetail(detail) {
  document.title = `${detail.name} — Fundprint`;

  // tabIndex -1 + focus() once rendered (below) so screen reader users get
  // a clear signal the page finished loading — the standard pattern for a
  // page whose real content replaces a loading state asynchronously,
  // since there's no full navigation/reload event to announce it for you.
  const heading = el("h1", { text: detail.name, tabindex: "-1" });
  const children = [
    el("div", { className: "header" }, [heading, partyBadge(detail.party)]),
    el("div", { className: "subline", text: `${officeLabel(detail)} · ${detail.cycle} cycle` }),
  ];

  const totalsSection = el("section", {}, [el("h2", { text: "Full totals" })]);
  totalsSection.appendChild(
    el("div", { className: "stat-grid" }, [
      stat("Total raised", detail.totals.raised),
      stat("Total disbursed", detail.totals.disbursements),
      stat("Cash on hand", detail.totals.cashOnHand),
      stat("From individuals", detail.totals.fromIndividuals),
      stat("— itemized (>$200)", detail.totals.fromIndividualsItemized),
      stat("— unitemized (≤$200)", detail.totals.fromIndividualsUnitemized),
      stat("From PACs/committees", detail.totals.fromCommittees),
      stat("From party committees", detail.totals.fromPartyCommittees),
      stat("Self-funding", detail.totals.selfFunding),
      stat("Debts owed by committee", detail.totals.debtsOwedByCommittee),
      stat("Debts owed to committee", detail.totals.debtsOwedToCommittee),
    ])
  );
  children.push(totalsSection);

  children.push(el("section", {}, [el("h2", { text: "Funding breakdown" }), breakdownChart(detail.totals)]));

  const committeesSection = el("section", {}, [el("h2", { text: "Top contributing committees" })]);
  if (detail.topCommitteesUnavailable) {
    committeesSection.appendChild(el("p", { className: "state-message", text: "Temporarily unavailable." }));
  } else {
    committeesSection.appendChild(
      detailList(detail.topCommittees, {
        empty: "None reported this cycle.",
        render: (c) => {
          const link = el("a", { href: "#", text: c.name });
          link.addEventListener("click", (e) => {
            e.preventDefault();
            openFunderDetail(c.id);
          });
          return el("li", {}, [link, el("span", { className: "amount", text: formatMoney(c.amount) })]);
        },
      })
    );
  }
  children.push(committeesSection);

  const employersSection = el("section", {}, [el("h2", { text: "Top employers of individual donors" })]);
  if (detail.topEmployersUnavailable) {
    employersSection.appendChild(el("p", { className: "state-message", text: "Temporarily unavailable." }));
  } else {
    employersSection.appendChild(
      detailList(detail.topEmployers, {
        empty: "None itemized this cycle.",
        render: (e) =>
          el("li", {}, [el("span", { text: e.employer }), el("span", { className: "amount", text: formatMoney(e.amount) })]),
      })
    );
  }
  children.push(employersSection);

  const linksSection = el("section", {}, [
    el("h2", { text: "Sources" }),
    el("p", { className: "as-of", text: `Data as of ${detail.asOfDate}` }),
    el("div", { className: "source-links" }, [
      el("a", { href: detail.fecCandidateUrl, target: "_blank", rel: "noopener", text: "View candidate on FEC.gov" }),
      ...(detail.fecCommitteeUrl
        ? [
            el("a", {
              href: detail.fecCommitteeUrl,
              target: "_blank",
              rel: "noopener",
              text: `View ${detail.committeeName || "committee"} on FEC.gov`,
            }),
          ]
        : []),
    ]),
  ]);
  children.push(linksSection);

  content.replaceChildren(...children);
  heading.focus();
}

async function main() {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    renderStateMessage("No candidate id given.");
    return;
  }

  let detail;
  try {
    detail = await chrome.runtime.sendMessage({ type: "FUNDPRINT_GET_CANDIDATE_DETAIL", id });
  } catch {
    renderStateMessage("Something went wrong loading this page. Try reloading it.");
    return;
  }

  if (!detail || detail.notFound) {
    renderStateMessage("No funding data found for this person.");
  } else if (detail.missingApiKey) {
    renderStateMessage("Add your free FEC API key in Fundprint's options to see funding data.", {
      openOptionsButton: true,
    });
  } else if (detail.invalidApiKey) {
    renderStateMessage("Your FEC API key looks invalid. Check it in Fundprint's options.", {
      openOptionsButton: true,
    });
  } else if (detail.rateLimited) {
    renderStateMessage("The FEC API's rate limit was reached. Try again in a few minutes.");
  } else if (detail.error) {
    renderStateMessage("Something went wrong loading this summary. Try again shortly.");
  } else {
    renderDetail(detail);
  }
}

main();
