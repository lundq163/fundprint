import { describe, it, expect, afterEach, vi } from "vitest";
import { fecGet, FecApiError } from "../providers/fecClient.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeResponse({ ok = true, status = 200, body = {} } = {}) {
  return { ok, status, json: async () => body };
}

describe("fecGet", () => {
  it("returns parsed JSON on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ body: { results: [{ a: 1 }] } }));
    vi.stubGlobal("fetch", fetchMock);

    const data = await fecGet("/candidate/S1/totals/", { cycle: 2026 }, "KEY");
    expect(data).toEqual({ results: [{ a: 1 }] });
  });

  it("builds the URL with params in order, then the api key, as a query string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse());
    vi.stubGlobal("fetch", fetchMock);

    await fecGet("/candidate/S1/totals/", { cycle: 2026, election_full: false }, "MYKEY");

    const calledUrl = fetchMock.mock.calls[0][0].toString();
    expect(calledUrl).toBe(
      "https://api.open.fec.gov/v1/candidate/S1/totals/?cycle=2026&election_full=false&api_key=MYKEY"
    );
  });

  it("omits null/undefined params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse());
    vi.stubGlobal("fetch", fetchMock);

    await fecGet("/path/", { a: "x", b: null, c: undefined }, "KEY");

    const calledUrl = fetchMock.mock.calls[0][0].toString();
    expect(calledUrl).toContain("a=x");
    expect(calledUrl).not.toContain("b=");
    expect(calledUrl).not.toContain("c=");
  });

  it("throws a rateLimited FecApiError on HTTP 429", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = fecGet("/path/", {}, "KEY");
    await expect(promise).rejects.toBeInstanceOf(FecApiError);
    await expect(promise).rejects.toMatchObject({ kind: "rateLimited" });
  });

  it("throws an invalidApiKey FecApiError on HTTP 403 with API_KEY_INVALID", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({ ok: false, status: 403, body: { error: { code: "API_KEY_INVALID" } } })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fecGet("/path/", {}, "BADKEY")).rejects.toMatchObject({
      kind: "invalidApiKey",
    });
  });

  it("throws a generic error FecApiError on HTTP 403 without that code", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 403, body: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fecGet("/path/", {}, "KEY")).rejects.toMatchObject({ kind: "error" });
  });

  it("throws a generic error FecApiError on another non-ok status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fecGet("/path/", {}, "KEY")).rejects.toMatchObject({ kind: "error" });
  });

  it("wraps a network failure as a generic error FecApiError", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("network down"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fecGet("/path/", {}, "KEY")).rejects.toMatchObject({ kind: "error" });
  });

  it("aborts and throws after the given timeout", async () => {
    const fetchMock = vi.fn((_url, { signal }) => {
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const err = new Error("This operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fecGet("/path/", {}, "KEY", { timeoutMs: 15 })).rejects.toMatchObject({
      kind: "error",
    });
  });
});
