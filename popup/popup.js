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

let currentHostname = null;

async function init() {
  globalToggle.checked = await getGlobalEnabled();

  // activeTab gives us the URL of the tab the user just clicked the
  // toolbar icon on, without granting broader "read all your tabs" access.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url) {
    try {
      currentHostname = new URL(tab.url).hostname;
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
