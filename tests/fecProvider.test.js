import { describe, it, expect, beforeEach, vi } from "vitest";
import { installChromeMock } from "./helpers/chromeMock.js";

// fecProvider.js's direct dependencies are mocked outright (rather than
// mocking fetch underneath them) so these tests exercise fecProvider's
// own orchestration/field-mapping logic in isolation — fecClient.js and
// legislators.js already have their own dedicated test files.
const { mockFecGet, mockGetApiKey, mockGetLegislator, mockGetLegislatorByFecId, MockFecApiError } = vi.hoisted(
  () => {
    class MockFecApiError extends Error {
      constructor(kind, message) {
        super(message);
        this.kind = kind;
      }
    }
    return {
      mockFecGet: vi.fn(),
      mockGetApiKey: vi.fn(),
      mockGetLegislator: vi.fn(),
      mockGetLegislatorByFecId: vi.fn(),
      MockFecApiError,
    };
  }
);

vi.mock("../providers/fecClient.js", () => ({
  fecGet: mockFecGet,
  FecApiError: MockFecApiError,
}));
vi.mock("../common/storage.js", () => ({ getApiKey: mockGetApiKey }));
vi.mock("../common/legislators.js", () => ({
  getLegislator: mockGetLegislator,
  getLegislatorByFecId: mockGetLegislatorByFecId,
}));

function expectedCycle() {
  const year = new Date().getFullYear();
  return year % 2 === 0 ? year : year + 1;
}

const SANDERS = {
  id: "S000033",
  first: "Bernard",
  last: "Sanders",
  party: "Independent",
  state: "VT",
  district: null,
  chamber: "sen",
  fecCandidateId: "S4VT00033",
};

beforeEach(() => {
  installChromeMock();
  vi.resetModules();
  mockFecGet.mockReset();
  mockGetApiKey.mockReset();
  mockGetLegislator.mockReset();
  mockGetLegislatorByFecId.mockReset();
  mockGetApiKey.mockResolvedValue("test-key");
});

describe("getSummary", () => {
  it("returns notFound for an unknown legislator", async () => {
    mockGetLegislator.mockResolvedValue(null);
    const { getSummary } = await import("../providers/fecProvider.js");
    expect(await getSummary("NOPE")).toEqual({ notFound: true, id: "NOPE" });
    expect(mockFecGet).not.toHaveBeenCalled();
  });

  it("returns notFound for a legislator with no fecCandidateId", async () => {
    mockGetLegislator.mockResolvedValue({ ...SANDERS, fecCandidateId: null });
    const { getSummary } = await import("../providers/fecProvider.js");
    expect(await getSummary("S000033")).toEqual({ notFound: true, id: "S000033" });
  });

  it("returns missingApiKey when no key is saved", async () => {
    mockGetLegislator.mockResolvedValue(SANDERS);
    mockGetApiKey.mockResolvedValue("");
    const { getSummary } = await import("../providers/fecProvider.js");
    expect(await getSummary("S000033")).toEqual({ missingApiKey: true, id: "S000033" });
    expect(mockFecGet).not.toHaveBeenCalled();
  });

  it("maps real FEC field names to the normalized summary shape correctly", async () => {
    mockGetLegislator.mockResolvedValue(SANDERS);
    mockFecGet.mockResolvedValue({
      results: [
        {
          receipts: 26476152.82,
          last_cash_on_hand_end_period: 21692072.46,
          individual_contributions: 25082378.06,
          other_political_committee_contributions: 27.0,
          political_party_committee_contributions: 100,
          candidate_contribution: 0,
          coverage_end_date: "2026-10-14T00:00:00",
        },
      ],
    });

    const { getSummary } = await import("../providers/fecProvider.js");
    const summary = await getSummary("S000033");

    expect(summary).toMatchObject({
      id: "S000033",
      name: "Bernard Sanders",
      party: "Independent",
      state: "VT",
      district: null,
      chamber: "sen",
      cycle: `${expectedCycle() - 1}–${expectedCycle()}`,
      totals: {
        raised: 26476152.82,
        cashOnHand: 21692072.46,
        fromIndividuals: 25082378.06,
        fromCommittees: 27.0 + 100, // other_political_committee + political_party_committee
        selfFunding: 0,
      },
      asOfDate: "2026-10-14",
      fecCandidateUrl: "https://www.fec.gov/data/candidate/S4VT00033/",
    });

    const [path, params] = mockFecGet.mock.calls[0];
    expect(path).toBe("/candidate/S4VT00033/totals/");
    expect(params).toMatchObject({ cycle: expectedCycle(), election_full: false });
  });

  it("returns notFound when FEC has no totals record for this candidate", async () => {
    mockGetLegislator.mockResolvedValue(SANDERS);
    mockFecGet.mockResolvedValue({ results: [] });
    const { getSummary } = await import("../providers/fecProvider.js");
    expect(await getSummary("S000033")).toEqual({ notFound: true, id: "S000033" });
  });

  it("surfaces a rateLimited FecApiError from fecGet", async () => {
    mockGetLegislator.mockResolvedValue(SANDERS);
    mockFecGet.mockRejectedValue(new MockFecApiError("rateLimited", "too many requests"));
    const { getSummary } = await import("../providers/fecProvider.js");
    expect(await getSummary("S000033")).toEqual({ rateLimited: true, id: "S000033" });
  });

  it("surfaces an invalidApiKey FecApiError from fecGet", async () => {
    mockGetLegislator.mockResolvedValue(SANDERS);
    mockFecGet.mockRejectedValue(new MockFecApiError("invalidApiKey", "bad key"));
    const { getSummary } = await import("../providers/fecProvider.js");
    expect(await getSummary("S000033")).toEqual({ invalidApiKey: true, id: "S000033" });
  });

  it("falls back to a generic error for a non-FecApiError failure", async () => {
    mockGetLegislator.mockResolvedValue(SANDERS);
    mockFecGet.mockRejectedValue(new Error("boom"));
    const { getSummary } = await import("../providers/fecProvider.js");
    expect(await getSummary("S000033")).toEqual({ error: true, id: "S000033" });
  });

  it("caches a successful result so a second call doesn't re-fetch", async () => {
    mockGetLegislator.mockResolvedValue(SANDERS);
    mockFecGet.mockResolvedValue({
      results: [{ receipts: 100, coverage_end_date: "2026-01-01" }],
    });
    const { getSummary } = await import("../providers/fecProvider.js");

    await getSummary("S000033");
    await getSummary("S000033");

    expect(mockFecGet).toHaveBeenCalledTimes(1);
  });
});

describe("getTopFunders", () => {
  const COMMITTEE = { id: "C00411330", name: "Friends of Bernie Sanders" };

  function mockCommitteeLookup(committee = COMMITTEE) {
    mockFecGet.mockImplementation((path) => {
      if (path.endsWith("/committees/")) return Promise.resolve({ results: committee ? [committee] : [] });
      return Promise.reject(new Error(`unexpected path in this test: ${path}`));
    });
  }

  it("returns empty lists with no fetch for an unknown legislator", async () => {
    mockGetLegislator.mockResolvedValue(null);
    const { getTopFunders } = await import("../providers/fecProvider.js");
    expect(await getTopFunders("NOPE")).toEqual({ topCommittees: [], topEmployers: [] });
    expect(mockFecGet).not.toHaveBeenCalled();
  });

  it("returns empty lists with no fetch when the API key is missing", async () => {
    mockGetLegislator.mockResolvedValue(SANDERS);
    mockGetApiKey.mockResolvedValue("");
    const { getTopFunders } = await import("../providers/fecProvider.js");
    expect(await getTopFunders("S000033")).toEqual({ topCommittees: [], topEmployers: [] });
    expect(mockFecGet).not.toHaveBeenCalled();
  });

  it("returns empty lists (no Unavailable flags) when the candidate has no principal committee", async () => {
    mockGetLegislator.mockResolvedValue(SANDERS);
    mockCommitteeLookup(null);
    const { getTopFunders } = await import("../providers/fecProvider.js");
    expect(await getTopFunders("S000033")).toEqual({ topCommittees: [], topEmployers: [] });
  });

  it("marks both sections unavailable when the committee lookup itself fails", async () => {
    mockGetLegislator.mockResolvedValue(SANDERS);
    mockFecGet.mockRejectedValue(new MockFecApiError("error", "timeout"));
    const { getTopFunders } = await import("../providers/fecProvider.js");
    expect(await getTopFunders("S000033")).toEqual({
      topCommittees: [],
      topCommitteesUnavailable: true,
      topEmployers: [],
      topEmployersUnavailable: true,
    });
  });

  it("aggregates top committees correctly, excluding non-committee contributor ids (e.g. a bank loan draw)", async () => {
    mockGetLegislator.mockResolvedValue(SANDERS);
    mockFecGet.mockImplementation((path) => {
      if (path.endsWith("/committees/")) return Promise.resolve({ results: [COMMITTEE] });
      if (path === "/schedules/schedule_a/by_employer/") {
        return Promise.resolve({
          results: [
            { employer: "RETIRED", total: 43025 },
            { employer: "SELF", total: 18870 },
          ],
        });
      }
      if (path === "/schedules/schedule_a/") {
        return Promise.resolve({
          results: [
            // Same PAC gives twice — amounts should sum.
            { contributor_id: "C00193631", contributor_name: "THE FARM CREDIT COUNCIL PAC", contribution_receipt_amount: 2500 },
            { contributor_id: "C00193631", contributor_name: "THE FARM CREDIT COUNCIL PAC", contribution_receipt_amount: 2500 },
            { contributor_id: "C00467431", contributor_name: "EYE OF THE TIGER PAC", contribution_receipt_amount: 5000 },
            // No real committee id — a bank honoring a loan, not a PAC; must be excluded.
            { contributor_id: null, contributor_name: "TRADITIONS BANK", contribution_receipt_amount: 6969.34 },
          ],
        });
      }
      return Promise.reject(new Error(`unexpected path: ${path}`));
    });

    const { getTopFunders } = await import("../providers/fecProvider.js");
    const result = await getTopFunders("S000033");

    expect(result.topEmployers).toEqual([
      { employer: "RETIRED", amount: 43025 },
      { employer: "SELF", amount: 18870 },
    ]);
    // Farm Credit Council PAC's two $2,500 gifts summed ($5,000) outrank
    // Eye of the Tiger's single $5,000 gift only by tie-order, but the
    // real assertion here is that TRADITIONS BANK never appears at all.
    expect(result.topCommittees).toHaveLength(2);
    expect(result.topCommittees.find((c) => c.id === "C00193631")).toMatchObject({
      name: "THE FARM CREDIT COUNCIL PAC",
      amount: 5000,
    });
    expect(result.topCommittees.some((c) => c.name === "TRADITIONS BANK")).toBe(false);
    // Promise.allSettled always resolves (never rejects) for a fulfilled
    // promise, so these are booleans — `false`, not merely falsy/absent.
    expect(result.topCommitteesUnavailable).toBe(false);
    expect(result.topEmployersUnavailable).toBe(false);
  });

  it("marks only the failed section unavailable when one of the two aggregation calls fails", async () => {
    mockGetLegislator.mockResolvedValue(SANDERS);
    mockFecGet.mockImplementation((path) => {
      if (path.endsWith("/committees/")) return Promise.resolve({ results: [COMMITTEE] });
      if (path === "/schedules/schedule_a/by_employer/") {
        return Promise.reject(new MockFecApiError("error", "FEC timed out"));
      }
      if (path === "/schedules/schedule_a/") {
        return Promise.resolve({ results: [] });
      }
      return Promise.reject(new Error(`unexpected path: ${path}`));
    });

    const { getTopFunders } = await import("../providers/fecProvider.js");
    const result = await getTopFunders("S000033");

    expect(result.topEmployersUnavailable).toBe(true);
    expect(result.topCommitteesUnavailable).toBe(false);
    expect(result.topCommittees).toEqual([]);
  });

  it("serves a cached successful result without re-fetching", async () => {
    mockGetLegislator.mockResolvedValue(SANDERS);
    mockCommitteeLookup();
    mockFecGet.mockImplementation((path) => {
      if (path.endsWith("/committees/")) return Promise.resolve({ results: [COMMITTEE] });
      return Promise.resolve({ results: [] });
    });

    const { getTopFunders } = await import("../providers/fecProvider.js");
    await getTopFunders("S000033");
    const callsAfterFirst = mockFecGet.mock.calls.length;
    await getTopFunders("S000033");

    expect(mockFecGet.mock.calls.length).toBe(callsAfterFirst);
  });
});

describe("getCandidateDetail", () => {
  it("returns notFound for an unknown legislator", async () => {
    mockGetLegislator.mockResolvedValue(null);
    const { getCandidateDetail } = await import("../providers/fecProvider.js");
    expect(await getCandidateDetail("NOPE")).toEqual({ notFound: true, id: "NOPE" });
  });

  it("maps the full totals breakdown, including debts and the itemized/unitemized split", async () => {
    mockGetLegislator.mockResolvedValue(SANDERS);
    mockFecGet.mockImplementation((path) => {
      if (path.endsWith("/committees/")) {
        return Promise.resolve({ results: [{ committee_id: "C00411330", name: "Friends of Bernie Sanders" }] });
      }
      if (path.endsWith("/totals/")) {
        return Promise.resolve({
          results: [
            {
              receipts: 100,
              disbursements: 50,
              last_cash_on_hand_end_period: 25,
              individual_contributions: 80,
              individual_itemized_contributions: 60,
              individual_unitemized_contributions: 20,
              other_political_committee_contributions: 10,
              political_party_committee_contributions: 5,
              candidate_contribution: 5,
              last_debts_owed_by_committee: 3,
              last_debts_owed_to_committee: 1,
              coverage_end_date: "2026-06-30T00:00:00",
            },
          ],
        });
      }
      return Promise.resolve({ results: [] });
    });

    const { getCandidateDetail } = await import("../providers/fecProvider.js");
    const detail = await getCandidateDetail("S000033");

    expect(detail.totals).toEqual({
      raised: 100,
      disbursements: 50,
      cashOnHand: 25,
      fromIndividuals: 80,
      fromIndividualsItemized: 60,
      fromIndividualsUnitemized: 20,
      fromCommittees: 10,
      fromPartyCommittees: 5,
      selfFunding: 5,
      debtsOwedByCommittee: 3,
      debtsOwedToCommittee: 1,
    });
    expect(detail.committeeId).toBe("C00411330");
    expect(detail.committeeName).toBe("Friends of Bernie Sanders");
    expect(detail.fecCommitteeUrl).toBe("https://www.fec.gov/data/committee/C00411330/");
    expect(detail.asOfDate).toBe("2026-06-30");
  });
});

describe("getFunderDetail", () => {
  it("returns missingApiKey when no key is saved", async () => {
    mockGetApiKey.mockResolvedValue("");
    const { getFunderDetail } = await import("../providers/fecProvider.js");
    expect(await getFunderDetail("C00411330")).toEqual({ missingApiKey: true, id: "C00411330" });
  });

  it("returns notFound when FEC has no totals for this committee", async () => {
    mockFecGet.mockResolvedValue({ results: [] });
    const { getFunderDetail } = await import("../providers/fecProvider.js");
    expect(await getFunderDetail("C00411330")).toEqual({ notFound: true, id: "C00411330" });
  });

  it("maps committee totals/type fields and resolves 'given to' candidates back to bioguide ids", async () => {
    mockFecGet.mockImplementation((path) => {
      if (path.endsWith("/totals/")) {
        return Promise.resolve({
          results: [
            {
              committee_name: "Example PAC",
              committee_type_full: "Political Action Committee",
              committee_designation_full: "Unauthorized",
              organization_type_full: "Trade Association",
              party_full: null,
              receipts: 1000,
              disbursements: 400,
              last_cash_on_hand_end_period: 600,
              coverage_end_date: "2026-09-30T00:00:00",
            },
          ],
        });
      }
      if (path === "/schedules/schedule_a/by_employer/") return Promise.resolve({ results: [] });
      if (path === "/schedules/schedule_a/") {
        return Promise.resolve({
          results: [
            { candidate_id: "H6AL04098", candidate_name: "ADERHOLT, ROBERT", contribution_receipt_amount: 5000 },
            { candidate_id: "P00000000", candidate_name: "SOME PRESIDENTIAL CANDIDATE", contribution_receipt_amount: 2000 },
          ],
        });
      }
      return Promise.resolve({ results: [] });
    });

    mockGetLegislatorByFecId.mockImplementation(async (fecId) => {
      if (fecId === "H6AL04098") return { id: "A000055" };
      return null;
    });

    const { getFunderDetail } = await import("../providers/fecProvider.js");
    const detail = await getFunderDetail("C00411330");

    expect(detail).toMatchObject({
      id: "C00411330",
      name: "Example PAC",
      committeeTypeFull: "Political Action Committee",
      designationFull: "Unauthorized",
      organizationTypeFull: "Trade Association",
      partyFull: null,
      totals: { receipts: 1000, disbursements: 400, cashOnHand: 600 },
      asOfDate: "2026-09-30",
      fecCommitteeUrl: "https://www.fec.gov/data/committee/C00411330/",
    });

    const aderholt = detail.topCandidates.find((c) => c.fecCandidateId === "H6AL04098");
    expect(aderholt).toMatchObject({ amount: 5000, bioguideId: "A000055" });
    const presidential = detail.topCandidates.find((c) => c.fecCandidateId === "P00000000");
    expect(presidential).toMatchObject({ amount: 2000, bioguideId: null });
  });
});
