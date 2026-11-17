// Funder (committee/PAC) detail page. Opened in a new tab from the hover
// card or the candidate detail page when clicking a contributing
// committee. Reads ?id=<FEC committee id> from the URL.

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

function openCandidateDetail(bioguideId) {
  window.open(chrome.runtime.getURL(`detail/candidate.html?id=${encodeURIComponent(bioguideId)}`), "_blank", "noopener");
}

function renderStateMessage(message, { openOptionsButton = false } = {}) {
  const children = [el("p", { className: "state-message", text: message })];
  if (openOptionsButton) {
    const btn = el("button", { text: "Open options" });
    btn.addEventListener("click", () => chrome.runtime.sendMessage({ type: "FUNDPRINT_OPEN_OPTIONS" }));
    children.push(el("div", { className: "actions" }, [btn]));
  }
  content.replaceChildren(...children);
}

function renderDetail(detail) {
  document.title = `${detail.name} — Fundprint`;

  const subline = [detail.committeeTypeFull, detail.designationFull, detail.organizationTypeFull, detail.partyFull]
    .filter(Boolean)
    .join(" · ");

  const children = [
    el("div", { className: "header" }, [el("h1", { text: detail.name })]),
    el("div", { className: "subline", text: subline || "Committee" }),
  ];

  children.push(
    el("section", {}, [
      el("h2", { text: "Totals" }),
      el("div", { className: "stat-grid" }, [
        el("div", {}, [
          el("div", { className: "stat-label", text: "Total receipts" }),
          el("div", { className: "stat-value", text: formatMoney(detail.totals.receipts) }),
        ]),
        el("div", {}, [
          el("div", { className: "stat-label", text: "Total disbursed" }),
          el("div", { className: "stat-value", text: formatMoney(detail.totals.disbursements) }),
        ]),
        el("div", {}, [
          el("div", { className: "stat-label", text: "Cash on hand" }),
          el("div", { className: "stat-value", text: formatMoney(detail.totals.cashOnHand) }),
        ]),
      ]),
    ])
  );

  const committeesSection = el("section", {}, [el("h2", { text: "Its own top contributing committees" })]);
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

  const employersSection = el("section", {}, [el("h2", { text: "Top employers of its individual donors" })]);
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

  const candidatesSection = el("section", {}, [el("h2", { text: "Candidates it has given to most" })]);
  if (detail.topCandidatesUnavailable) {
    candidatesSection.appendChild(el("p", { className: "state-message", text: "Temporarily unavailable." }));
  } else {
    candidatesSection.appendChild(
      detailList(detail.topCandidates, {
        empty: "No candidate contributions reported this cycle.",
        render: (c) => {
          const nameEl = c.bioguideId ? el("a", { href: "#", text: c.name }) : el("span", { text: c.name });
          if (c.bioguideId) {
            nameEl.addEventListener("click", (e) => {
              e.preventDefault();
              openCandidateDetail(c.bioguideId);
            });
          }
          return el("li", {}, [nameEl, el("span", { className: "amount", text: formatMoney(c.amount) })]);
        },
      })
    );
  }
  children.push(candidatesSection);

  children.push(
    el("section", {}, [
      el("h2", { text: "Sources" }),
      el("p", { className: "as-of", text: `Data as of ${detail.asOfDate}` }),
      el("div", { className: "source-links" }, [
        el("a", { href: detail.fecCommitteeUrl, target: "_blank", rel: "noopener", text: "View on FEC.gov" }),
      ]),
    ])
  );

  content.replaceChildren(...children);
}

async function main() {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    renderStateMessage("No committee id given.");
    return;
  }

  let detail;
  try {
    detail = await chrome.runtime.sendMessage({ type: "FUNDPRINT_GET_FUNDER_DETAIL", id });
  } catch {
    renderStateMessage("Something went wrong loading this page. Try reloading it.");
    return;
  }

  if (!detail || detail.notFound) {
    renderStateMessage("No data found for this committee.");
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
