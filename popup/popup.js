import {
  getGlobalEnabled,
  setGlobalEnabled,
  isSiteEnabled,
  setSiteEnabled,
} from "../common/storage.js";

const globalToggle = document.getElementById("global-toggle");
const siteToggle = document.getElementById("site-toggle");
const siteHostLabel = document.getElementById("site-host");
const openOptionsLink = document.getElementById("open-options");
const matchCountEl = document.getElementById("match-count");
const countNoteEl = document.getElementById("count-note");

let currentHostname = null;
let currentTabId = null;

async function init() {
  globalToggle.checked = await getGlobalEnabled();

  // activeTab gives us the URL of the tab the user just clicked the
  // toolbar icon on, without granting broader "read all your tabs" access.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url) {
    try {
      currentHostname = new URL(tab.url).hostname;
      currentTabId = tab.id;
    } catch {
      currentHostname = null;
    }
  }

  if (currentHostname) {
    siteHostLabel.textContent = currentHostname;
    siteToggle.checked = await isSiteEnabled(currentHostname);
  } else {
    // e.g. chrome:// pages, the new tab page, etc.
    siteHostLabel.textContent = "this page";
    siteToggle.disabled = true;
  }

  await refreshMatchCount();
}

async function refreshMatchCount() {
  if (!currentTabId) {
    matchCountEl.textContent = "—";
    return;
  }
  try {
    const response = await chrome.tabs.sendMessage(currentTabId, {
      type: "FUNDPRINT_GET_MATCH_COUNT",
    });
    if (response?.disabled) {
      matchCountEl.textContent = "—";
      countNoteEl.textContent = "Fundprint is off for this page.";
      countNoteEl.hidden = false;
    } else {
      matchCountEl.textContent = String(response?.count ?? 0);
      countNoteEl.hidden = true;
    }
  } catch {
    // No content script here (e.g. a chrome:// page, the Chrome Web
    // Store, or a page that was open before the extension was loaded).
    matchCountEl.textContent = "—";
    countNoteEl.textContent = "Fundprint isn't active on this page.";
    countNoteEl.hidden = false;
  }
}

globalToggle.addEventListener("change", () => {
  setGlobalEnabled(globalToggle.checked);
});

siteToggle.addEventListener("change", () => {
  if (currentHostname) {
    setSiteEnabled(currentHostname, siteToggle.checked);
  }
});

openOptionsLink.addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

init();
