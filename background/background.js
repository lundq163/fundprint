// Background service worker (Manifest V3).
//
// Responsibilities (grows over future milestones):
//  - Milestone 1: open the welcome page on first install.
//  - Later: own all network calls to the FEC API (content scripts and
//    detail-tab pages never call the network directly, they message us).
//    Centralizing network access here is also what makes it possible to
//    later point everything at a proxy server with one config change.

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome/welcome.html") });
  }
});
