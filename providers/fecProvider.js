// Real FEC-backed data provider: getSummary(id) -> normalized summary.
// background.js is the only thing that calls this.
//
// Split into two independent calls on purpose:
//   - getSummary(id): candidate info + official aggregated totals. One
//     fast, non-aggregating FEC call. This is what the card renders
//     immediately.
//   - getTopFunders(id): top contributing committees/PACs (approximated
//     client-side — no server-side aggregation endpoint exists for this)
//     and top employers of individual donors (FEC aggregates this one
//     server-side). These are slow aggregation queries that can legitimately
//     time out server-side for very high-volume committees (confirmed in
//     testing against a sitting senator's committee), so they're fetched
//     separately and shouldn't block or break the totals the card already
//     has.
//
// Both are cached in chrome.storage.session. Successful results get a
// 24h TTL. A getTopFunders result where a section came back unavailable
// gets a much shorter TTL (1h) — long enough that rapid repeat hovers
// don't re-trigger the same slow timeout, short enough to retry again
// reasonably soon rather than being "stuck" unavailable for a full day.

import { fecGet, FecApiError } from "./fecClient.js";
import { getApiKey } from "../common/storage.js";
import { getLegislator, getLegislatorByFecId } from "../common/legislators.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const AGGREGATION_TIMEOUT_MS = 8000;

function currentCycle() {
  const year = new Date().getFullYear();
  return year % 2 === 0 ? year : year + 1;
}

async function getCached(key, ttlMs) {
  const stored = await chrome.storage.session.get(key);
  const entry = stored[key];
  if (entry && Date.now() - entry.fetchedAt < ttlMs) {
    return entry.data;
  }
  return null;
}

async function setCached(key, data) {
  await chrome.storage.session.set({ [key]: { data, fetchedAt: Date.now() } });
}

async function findPrincipalCommittee(fecCandidateId, apiKey, cycle) {
  const data = await fecGet(
    `/candidate/${fecCandidateId}/committees/`,
    { cycle, designation: "P" },
    apiKey
  );
  const result = data.results?.[0];
  return result ? { id: result.committee_id, name: result.name } : null;
}

// Committee lookups are cheap and stable (not an aggregation query), so
// these get the long TTL unconditionally, cached separately from the
// funders/detail results so every caller can share one lookup.
async function getPrincipalCommittee(fecCandidateId, apiKey, cycle) {
  const cacheKey = `fec-committee:${fecCandidateId}:${cycle}`;
  const cached = await getCached(cacheKey, DAY_MS);
  if (cached) return cached;

  const committee = await findPrincipalCommittee(fecCandidateId, apiKey, cycle);
  await setCached(cacheKey, committee);
  return committee;
}

async function fetchTotals(fecCandidateId, apiKey, cycle) {
  const data = await fecGet(
    `/candidate/${fecCandidateId}/totals/`,
    { cycle, election_full: false },
    apiKey
  );
  return data.results?.[0] || null;
}

async function fetchTopEmployers(committeeId, apiKey, cycle, limit = 3) {
  const data = await fecGet(
    "/schedules/schedule_a/by_employer/",
    { committee_id: committeeId, cycle, sort: "-total", per_page: limit },
    apiKey,
    { timeoutMs: AGGREGATION_TIMEOUT_MS }
  );
  return (data.results || [])
    .filter((r) => r.employer)
    .map((r) => ({ employer: r.employer, amount: r.total || 0 }));
}

async function fetchTopCommittees(committeeId, apiKey, cycle, limit = 3) {
  const data = await fecGet(
    "/schedules/schedule_a/",
    {
      committee_id: committeeId,
      contributor_type: "committee",
      two_year_transaction_period: cycle,
      sort: "-contribution_receipt_amount",
      per_page: 100,
    },
    apiKey,
    { timeoutMs: AGGREGATION_TIMEOUT_MS }
  );

  const totalsByContributor = new Map();
  for (const record of data.results || []) {
    // A real PAC/committee has an FEC committee id ("C" + digits). Some
    // Schedule A records with contributor_type=committee but no such id
    // turned out, in testing, to be bank loan draws — not contributions
    // — so they're excluded here rather than misrepresented as PAC money.
    if (!record.contributor_id || !/^C\d+/.test(record.contributor_id)) continue;
    const existing = totalsByContributor.get(record.contributor_id);
    const amount = record.contribution_receipt_amount || 0;
    if (existing) {
      existing.amount += amount;
    } else {
      totalsByContributor.set(record.contributor_id, {
        id: record.contributor_id,
        name: record.contributor_name || record.contributor_id,
        amount,
      });
    }
  }
  return [...totalsByContributor.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
}

async function fetchCommitteeTotals(committeeId, apiKey, cycle) {
  const data = await fecGet(`/committee/${committeeId}/totals/`, { cycle }, apiKey);
  return data.results?.[0] || null;
}

// "Which candidates has this committee given to most" — same approach as
// fetchTopCommittees but inverted: filter Schedule A by contributor_id
// (this committee as the GIVER) instead of committee_id (as the
// recipient), and aggregate by the recipient's candidate_id. FEC's
// Schedule A records conveniently embed the recipient committee's
// candidate_id/candidate_name directly when the recipient is a
// candidate's committee, so no extra lookup is needed for that — only
// for linking back to our own candidate detail page, which needs the
// bioguide id instead of the FEC candidate id.
async function fetchTopCandidatesGivenTo(committeeId, apiKey, cycle, limit = 3) {
  const data = await fecGet(
    "/schedules/schedule_a/",
    {
      contributor_id: committeeId,
      two_year_transaction_period: cycle,
      sort: "-contribution_receipt_amount",
      per_page: 100,
    },
    apiKey,
    { timeoutMs: AGGREGATION_TIMEOUT_MS }
  );

  const totalsByCandidate = new Map();
  for (const record of data.results || []) {
    if (!record.candidate_id) continue; // not a candidate committee recipient
    const existing = totalsByCandidate.get(record.candidate_id);
    const amount = record.contribution_receipt_amount || 0;
    if (existing) {
      existing.amount += amount;
    } else {
      totalsByCandidate.set(record.candidate_id, {
        fecCandidateId: record.candidate_id,
        name: record.candidate_name || record.candidate_id,
        amount,
      });
    }
  }

  const top = [...totalsByCandidate.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
  await Promise.all(
    top.map(async (entry) => {
      const legislator = await getLegislatorByFecId(entry.fecCandidateId);
      entry.bioguideId = legislator?.id || null;
    })
  );
  return top;
}

function errorResult(err, id) {
  if (err instanceof FecApiError) {
    if (err.kind === "rateLimited") return { rateLimited: true, id };
    if (err.kind === "invalidApiKey") return { invalidApiKey: true, id };
  }
  return { error: true, id };
}

export async function getSummary(id) {
  const legislator = await getLegislator(id);
  if (!legislator || !legislator.fecCandidateId) {
    return { notFound: true, id };
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    return { missingApiKey: true, id };
  }

  const cycle = currentCycle();
  const cacheKey = `fec-summary:${id}:${cycle}`;
  const cached = await getCached(cacheKey, DAY_MS);
  if (cached) return cached;

  let totals;
  try {
    totals = await fetchTotals(legislator.fecCandidateId, apiKey, cycle);
  } catch (err) {
    return errorResult(err, id);
  }
  if (!totals) {
    return { notFound: true, id };
  }

  const summary = {
    id,
    name: `${legislator.first} ${legislator.last}`,
    party: legislator.party,
    state: legislator.state,
    district: legislator.district,
    chamber: legislator.chamber,
    cycle: `${cycle - 1}–${cycle}`,
    totals: {
      raised: totals.receipts || 0,
      cashOnHand: totals.last_cash_on_hand_end_period || 0,
      fromIndividuals: totals.individual_contributions || 0,
      fromCommittees:
        (totals.other_political_committee_contributions || 0) +
        (totals.political_party_committee_contributions || 0),
      selfFunding: totals.candidate_contribution || 0,
    },
    asOfDate: (totals.coverage_end_date || "").slice(0, 10),
    fecCandidateUrl: `https://www.fec.gov/data/candidate/${legislator.fecCandidateId}/`,
  };

  await setCached(cacheKey, summary);
  return summary;
}

export async function getTopFunders(id) {
  const legislator = await getLegislator(id);
  if (!legislator || !legislator.fecCandidateId) {
    return { topCommittees: [], topEmployers: [] };
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    // getSummary() already surfaces the missing-key state to the card;
    // this just quietly has nothing to add.
    return { topCommittees: [], topEmployers: [] };
  }

  const cycle = currentCycle();
  const cacheKey = `fec-funders:${id}:${cycle}`;
  const stored = await chrome.storage.session.get(cacheKey);
  const entry = stored[cacheKey];
  if (entry) {
    const partial = entry.data.topCommitteesUnavailable || entry.data.topEmployersUnavailable;
    if (Date.now() - entry.fetchedAt < (partial ? HOUR_MS : DAY_MS)) {
      return entry.data;
    }
  }

  let committee;
  try {
    committee = await getPrincipalCommittee(legislator.fecCandidateId, apiKey, cycle);
  } catch {
    const result = {
      topCommittees: [],
      topCommitteesUnavailable: true,
      topEmployers: [],
      topEmployersUnavailable: true,
    };
    await setCached(cacheKey, result);
    return result;
  }

  if (!committee) {
    const result = { topCommittees: [], topEmployers: [] };
    await setCached(cacheKey, result);
    return result;
  }
  const committeeId = committee.id;

  const [employersResult, committeesResult] = await Promise.allSettled([
    fetchTopEmployers(committeeId, apiKey, cycle),
    fetchTopCommittees(committeeId, apiKey, cycle),
  ]);

  const result = {
    topEmployers: employersResult.status === "fulfilled" ? employersResult.value : [],
    topEmployersUnavailable: employersResult.status === "rejected",
    topCommittees: committeesResult.status === "fulfilled" ? committeesResult.value : [],
    topCommitteesUnavailable: committeesResult.status === "rejected",
  };
  await setCached(cacheKey, result);
  return result;
}

const DETAIL_LIST_LIMIT = 10;

// Candidate detail page: same shape as getSummary()'s totals, plus the
// full breakdown (debts, disbursements) and top-10 (not top-3) funder
// lists in one call — a dedicated tab can afford to wait slightly longer
// than a hover card for the complete picture.
export async function getCandidateDetail(id) {
  const legislator = await getLegislator(id);
  if (!legislator || !legislator.fecCandidateId) {
    return { notFound: true, id };
  }

  const apiKey = await getApiKey();
  if (!apiKey) {
    return { missingApiKey: true, id };
  }

  const cycle = currentCycle();
  const cacheKey = `fec-detail:${id}:${cycle}`;
  const cached = await getCached(cacheKey, DAY_MS);
  if (cached) return cached;

  let totals;
  let committee;
  try {
    [totals, committee] = await Promise.all([
      fetchTotals(legislator.fecCandidateId, apiKey, cycle),
      getPrincipalCommittee(legislator.fecCandidateId, apiKey, cycle),
    ]);
  } catch (err) {
    return errorResult(err, id);
  }
  if (!totals) {
    return { notFound: true, id };
  }

  const [employersResult, committeesResult] = committee
    ? await Promise.allSettled([
        fetchTopEmployers(committee.id, apiKey, cycle, DETAIL_LIST_LIMIT),
        fetchTopCommittees(committee.id, apiKey, cycle, DETAIL_LIST_LIMIT),
      ])
    : [
        { status: "fulfilled", value: [] },
        { status: "fulfilled", value: [] },
      ];

  const detail = {
    id,
    name: `${legislator.first} ${legislator.last}`,
    party: legislator.party,
    state: legislator.state,
    district: legislator.district,
    chamber: legislator.chamber,
    cycle: `${cycle - 1}–${cycle}`,
    totals: {
      raised: totals.receipts || 0,
      disbursements: totals.disbursements || 0,
      cashOnHand: totals.last_cash_on_hand_end_period || 0,
      fromIndividuals: totals.individual_contributions || 0,
      fromIndividualsItemized: totals.individual_itemized_contributions || 0,
      fromIndividualsUnitemized: totals.individual_unitemized_contributions || 0,
      fromCommittees: totals.other_political_committee_contributions || 0,
      fromPartyCommittees: totals.political_party_committee_contributions || 0,
      selfFunding: totals.candidate_contribution || 0,
      debtsOwedByCommittee: totals.last_debts_owed_by_committee || 0,
      debtsOwedToCommittee: totals.last_debts_owed_to_committee || 0,
    },
    topEmployers: employersResult.status === "fulfilled" ? employersResult.value : [],
    topEmployersUnavailable: employersResult.status === "rejected",
    topCommittees: committeesResult.status === "fulfilled" ? committeesResult.value : [],
    topCommitteesUnavailable: committeesResult.status === "rejected",
    asOfDate: (totals.coverage_end_date || "").slice(0, 10),
    fecCandidateUrl: `https://www.fec.gov/data/candidate/${legislator.fecCandidateId}/`,
    committeeId: committee?.id || null,
    committeeName: committee?.name || null,
    fecCommitteeUrl: committee ? `https://www.fec.gov/data/committee/${committee.id}/` : null,
  };

  await setCached(cacheKey, detail);
  return detail;
}

// Funder detail page (a committee/PAC rather than a candidate): what kind
// of committee it is, its own totals, its own top funders (same
// aggregation helpers as above, just pointed at this committee instead of
// a candidate's), and which candidates it has given to most.
export async function getFunderDetail(committeeId) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { missingApiKey: true, id: committeeId };
  }

  const cycle = currentCycle();
  const cacheKey = `fec-funder-detail:${committeeId}:${cycle}`;
  const cached = await getCached(cacheKey, DAY_MS);
  if (cached) return cached;

  let committeeTotals;
  try {
    committeeTotals = await fetchCommitteeTotals(committeeId, apiKey, cycle);
  } catch (err) {
    return errorResult(err, committeeId);
  }
  if (!committeeTotals) {
    return { notFound: true, id: committeeId };
  }

  const [employersResult, committeesResult, candidatesResult] = await Promise.allSettled([
    fetchTopEmployers(committeeId, apiKey, cycle, DETAIL_LIST_LIMIT),
    fetchTopCommittees(committeeId, apiKey, cycle, DETAIL_LIST_LIMIT),
    fetchTopCandidatesGivenTo(committeeId, apiKey, cycle, DETAIL_LIST_LIMIT),
  ]);

  const detail = {
    id: committeeId,
    name: committeeTotals.committee_name || committeeId,
    committeeTypeFull: committeeTotals.committee_type_full || null,
    designationFull: committeeTotals.committee_designation_full || null,
    organizationTypeFull: committeeTotals.organization_type_full || null,
    partyFull: committeeTotals.party_full || null,
    totals: {
      receipts: committeeTotals.receipts || 0,
      disbursements: committeeTotals.disbursements || 0,
      cashOnHand: committeeTotals.last_cash_on_hand_end_period || 0,
    },
    asOfDate: (committeeTotals.coverage_end_date || "").slice(0, 10),
    topEmployers: employersResult.status === "fulfilled" ? employersResult.value : [],
    topEmployersUnavailable: employersResult.status === "rejected",
    topCommittees: committeesResult.status === "fulfilled" ? committeesResult.value : [],
    topCommitteesUnavailable: committeesResult.status === "rejected",
    topCandidates: candidatesResult.status === "fulfilled" ? candidatesResult.value : [],
    topCandidatesUnavailable: candidatesResult.status === "rejected",
    fecCommitteeUrl: `https://www.fec.gov/data/committee/${committeeId}/`,
  };

  await setCached(cacheKey, detail);
  return detail;
}
