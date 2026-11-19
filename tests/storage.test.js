import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock } from "./helpers/chromeMock.js";
import {
  getApiKey,
  setApiKey,
  getGlobalEnabled,
  setGlobalEnabled,
  isSiteEnabled,
  setSiteEnabled,
} from "../common/storage.js";

beforeEach(() => {
  installChromeMock();
});

describe("storage", () => {
  it("getApiKey defaults to an empty string when unset", async () => {
    expect(await getApiKey()).toBe("");
  });

  it("round-trips the API key", async () => {
    await setApiKey("abc123");
    expect(await getApiKey()).toBe("abc123");
  });

  it("getGlobalEnabled defaults to true when never set", async () => {
    expect(await getGlobalEnabled()).toBe(true);
  });

  it("round-trips the global enabled flag", async () => {
    await setGlobalEnabled(false);
    expect(await getGlobalEnabled()).toBe(false);
    await setGlobalEnabled(true);
    expect(await getGlobalEnabled()).toBe(true);
  });

  it("isSiteEnabled defaults to true for a site never toggled", async () => {
    expect(await isSiteEnabled("example.com")).toBe(true);
  });

  it("round-trips a per-site flag without affecting other sites", async () => {
    await setSiteEnabled("example.com", false);
    expect(await isSiteEnabled("example.com")).toBe(false);
    expect(await isSiteEnabled("other.com")).toBe(true);
  });

  it("setSiteEnabled merges into the existing map rather than replacing it", async () => {
    await setSiteEnabled("a.com", false);
    await setSiteEnabled("b.com", false);
    expect(await isSiteEnabled("a.com")).toBe(false);
    expect(await isSiteEnabled("b.com")).toBe(false);
  });
});
