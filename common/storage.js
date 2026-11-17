// Shared settings storage used by the popup, options page, background
// worker, and (starting in a later milestone) the content script.
//
// Everything lives in chrome.storage.local. Per the privacy design, the
// ONLY things we ever store are: the user's own FEC API key, the global
// on/off switch, and a map of per-domain on/off switches. No browsing
// history, no analytics, no page content.

const KEYS = {
  API_KEY: "apiKey",
  GLOBAL_ENABLED: "globalEnabled",
  SITE_ENABLED: "siteEnabled", // { [hostname]: boolean }
};

export async function getApiKey() {
  const result = await chrome.storage.local.get(KEYS.API_KEY);
  return result[KEYS.API_KEY] || "";
}

export async function setApiKey(key) {
  await chrome.storage.local.set({ [KEYS.API_KEY]: key });
}

export async function getGlobalEnabled() {
  const result = await chrome.storage.local.get(KEYS.GLOBAL_ENABLED);
  // Default to enabled if never set.
  return result[KEYS.GLOBAL_ENABLED] !== false;
}

export async function setGlobalEnabled(enabled) {
  await chrome.storage.local.set({ [KEYS.GLOBAL_ENABLED]: enabled });
}

export async function isSiteEnabled(hostname) {
  const result = await chrome.storage.local.get(KEYS.SITE_ENABLED);
  const map = result[KEYS.SITE_ENABLED] || {};
  // Default to enabled for sites the user hasn't explicitly toggled.
  return map[hostname] !== false;
}

export async function setSiteEnabled(hostname, enabled) {
  const result = await chrome.storage.local.get(KEYS.SITE_ENABLED);
  const map = result[KEYS.SITE_ENABLED] || {};
  map[hostname] = enabled;
  await chrome.storage.local.set({ [KEYS.SITE_ENABLED]: map });
}
