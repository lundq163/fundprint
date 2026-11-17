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

import { getSummary, getTopFunders, getCandidateDetail, getFunderDetail } from "../providers/fecProvider.js";

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome/welcome.html") });
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
