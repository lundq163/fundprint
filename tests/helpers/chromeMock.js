// A minimal in-memory stand-in for the slice of the chrome.* extension
// API this codebase actually uses (chrome.runtime.getURL, chrome.storage.
// local/session), so common/*.js and providers/*.js can be unit-tested in
// plain Node without a real browser or extension host.

export function createStorageArea() {
  let store = {};
  return {
    async get(keys) {
      if (keys == null) return { ...store };
      if (typeof keys === "string") return { [keys]: store[keys] };
      if (Array.isArray(keys)) {
        const result = {};
        for (const key of keys) result[key] = store[key];
        return result;
      }
      // Object-of-defaults form (chrome.storage.*.get({key: default})) —
      // unused elsewhere in this codebase, but handled for completeness.
      const result = {};
      for (const key of Object.keys(keys)) {
        result[key] = key in store ? store[key] : keys[key];
      }
      return result;
    },
    async set(items) {
      Object.assign(store, items);
    },
    async remove(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
    },
    async clear() {
      store = {};
    },
  };
}

// Reassigns a fresh chrome global with empty storage — call from
// beforeEach so every test starts isolated, with no leftover state from
// a previous test.
export function installChromeMock() {
  globalThis.chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://test-extension-id/${path}`,
    },
    storage: {
      local: createStorageArea(),
      session: createStorageArea(),
    },
  };
  return globalThis.chrome;
}
