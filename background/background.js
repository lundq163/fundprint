// Background service worker (Manifest V3).
//
// Responsibilities (grows over future milestones):
//  - Milestone 1: open the welcome page on first install.
//  - Milestone 3: answer FUNDPRINT_GET_SUMMARY requests from the content
//    script's hover card, by calling a provider module.
//  - Milestone 4: that provider is now the real FEC-backed one. All
//    network calls to the FEC API happen here, never in the content
//    script or detail pages — they only ever message us.
//  - Milestone 5: also answer the candidate/funder detail tabs.
//  - Milestone 6: the right-click "Look up funding" fallback.

import { getSummary, getTopFunders, getCandidateDetail, getFunderDetail } from "../providers/fecProvider.js";
import { buildMatcher } from "../common/matcher.js";
import { getLegislator } from "../common/legislators.js";

const LOOKUP_MENU_ID = "fundprint-lookup";

chrome.runtime.onInstalled.addListener((details) => {
  // contextMenus items don't survive an extension reload/update, so this
  // has to run on every onInstalled firing (install AND update), not just
  // first install. removeAll() first makes it safe to run repeatedly.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      {
        id: LOOKUP_MENU_ID,
        title: "Look up funding",
        contexts: ["selection"],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error("Fundprint: context menu creation failed —", chrome.runtime.lastError.message);
        }
      }
    );
  });

  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome/welcome.html") });
  }
});

// Lazily built once, reused for every right-click lookup — same matcher
// logic the content script uses, so the fallback behaves consistently
// (e.g. it won't match a bare last name either, same as on-page scanning).
let matcherPromise = null;
function getMatcher() {
  if (!matcherPromise) {
    matcherPromise = fetch(chrome.runtime.getURL("data/legislators.json"))
      .then((r) => r.json())
      .then((legislators) => buildMatcher(legislators.map((l) => ({ id: l.id, names: l.names }))));
  }
  return matcherPromise;
}

function notify(message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "Fundprint",
    message,
  }, () => {
    // chrome.notifications.create() reports failures via lastError rather
    // than a rejected promise/thrown error — has to be checked explicitly
    // or a failure (e.g. OS notifications blocked for Chrome) is invisible.
    if (chrome.runtime.lastError) {
      console.error("Fundprint: notification failed —", chrome.runtime.lastError.message);
    }
  });
}

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== LOOKUP_MENU_ID) return;

  try {
    const selectedText = info.selectionText || "";
    const matcher = await getMatcher();
    const matches = matcher.findMatches(selectedText);

    if (matches.length === 0) {
      notify(`No current member of Congress matched "${selectedText.slice(0, 60)}".`);
      return;
    }

    // A longer selection could contain more than one name; use the first
    // one found.
    const { ids, text } = matches[0];

    if (ids.length > 1) {
      // Unlike the hover card, there's no interactive picker possible
      // here — this is a one-shot action with only a notification as
      // feedback. Rather than guess, list who it could be and point the
      // user at the hover card instead, which can disambiguate properly.
      const legislators = await Promise.all(ids.map((id) => getLegislator(id)));
      const names = legislators
        .filter(Boolean)
        .map((l) => `${l.first} ${l.last} (${l.chamber === "sen" ? "Sen." : "Rep."}, ${l.state}${l.district != null ? "-" + l.district : ""})`);
      notify(`"${text}" matches more than one current member: ${names.join("; ")}. Try hovering the name on the page instead — it can show a picker.`);
      return;
    }

    chrome.tabs.create({
      url: chrome.runtime.getURL(`detail/candidate.html?id=${encodeURIComponent(ids[0])}`),
    });
  } catch (err) {
    // Without this, a failure here (e.g. the legislators.json fetch
    // failing) was silently swallowed — right-click did nothing with no
    // feedback and no visible error outside the service worker console.
    console.error("Fundprint: 'Look up funding' failed —", err);
    notify("Something went wrong looking that up. Check the service worker console for details.");
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "FUNDPRINT_GET_SUMMARY") {
    return getSummary(message.id);
  }
  if (message?.type === "FUNDPRINT_GET_TOP_FUNDERS") {
    return getTopFunders(message.id);
  }
  if (message?.type === "FUNDPRINT_GET_CANDIDATE_DETAIL") {
    return getCandidateDetail(message.id);
  }
  if (message?.type === "FUNDPRINT_GET_FUNDER_DETAIL") {
    return getFunderDetail(message.id);
  }
  if (message?.type === "FUNDPRINT_OPEN_OPTIONS") {
    // chrome.runtime.openOptionsPage() isn't available to content scripts,
    // so the card asks us to do it instead of linking there directly.
    chrome.runtime.openOptionsPage();
  }
});
