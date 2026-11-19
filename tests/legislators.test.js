import { describe, it, expect, beforeEach, vi } from "vitest";
import { installChromeMock } from "./helpers/chromeMock.js";

const FIXTURE = [
  { id: "S000033", first: "Bernard", last: "Sanders", fecCandidateId: "S4VT00033" },
  { id: "C000127", first: "Maria", last: "Cantwell", fecCandidateId: "S8WA00194" },
  { id: "NOFEC01", first: "No", last: "FecId", fecCandidateId: null },
];

// legislators.js caches its fetch in module-level state, so each test
// needs a genuinely fresh module instance (vi.resetModules() + a dynamic
// re-import) — otherwise an earlier test's fixture/call-count would leak
// into a later one.
beforeEach(() => {
  installChromeMock();
  vi.resetModules();
});

function stubFetchWithFixture(fixture = FIXTURE) {
  const fetchMock = vi.fn().mockResolvedValue({ json: async () => fixture });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("legislators", () => {
  it("getLegislator looks up by bioguide id", async () => {
    stubFetchWithFixture();
    const { getLegislator } = await import("../common/legislators.js");
    expect(await getLegislator("S000033")).toMatchObject({ first: "Bernard", last: "Sanders" });
  });

  it("getLegislator returns null for an unknown id", async () => {
    stubFetchWithFixture();
    const { getLegislator } = await import("../common/legislators.js");
    expect(await getLegislator("NOT-A-REAL-ID")).toBeNull();
  });

  it("getLegislatorByFecId looks up by FEC candidate id", async () => {
    stubFetchWithFixture();
    const { getLegislatorByFecId } = await import("../common/legislators.js");
    expect(await getLegislatorByFecId("S4VT00033")).toMatchObject({ id: "S000033" });
  });

  it("getLegislatorByFecId never resolves a legislator with no fecCandidateId", async () => {
    stubFetchWithFixture();
    const { getLegislatorByFecId } = await import("../common/legislators.js");
    expect(await getLegislatorByFecId(null)).toBeNull();
  });

  it("fetches the bundled data only once across multiple lookups", async () => {
    const fetchMock = stubFetchWithFixture();
    const { getLegislator, getLegislatorByFecId } = await import("../common/legislators.js");
    await getLegislator("S000033");
    await getLegislator("C000127");
    await getLegislatorByFecId("S4VT00033");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fetches from the extension's own bundled data URL", async () => {
    const fetchMock = stubFetchWithFixture();
    const { getLegislator } = await import("../common/legislators.js");
    await getLegislator("S000033");
    expect(fetchMock).toHaveBeenCalledWith("chrome-extension://test-extension-id/data/legislators.json");
  });
});
