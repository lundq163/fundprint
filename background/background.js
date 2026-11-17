// Background service worker (Manifest V3).
//
// Responsibilities (grows over future milestones):
//  - Milestone 1: open the welcome page on first install.
//  - Milestone 3: answer FUNDPRINT_GET_SUMMARY requests from the content
//    script's hover card, by calling a provider module.
//  - Later: own all real network calls to the FEC API too (content
//    scripts and detail pages never call the network directly, they
//    message us). Centralizing network access here is also what makes it
//    possible to later point everything at a proxy server with one
//    config change.

// Milestone 3: swap this import for a real FEC-backed provider in
// Milestone 4. Nothing outside this file needs to change — the content
// script and detail pages only ever talk to us via FUNDPRINT_GET_SUMMARY,
// never to a provider module directly.
import { getSummary } from "../providers/mockProvider.js";

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome/welcome.html") });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "FUNDPRINT_GET_SUMMARY") {
    return getSummary(message.id);
  }
});
