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
import { getLegislator } from "../common/legislators.js";

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

async function findPrincipalCommitteeId(fecCandidateId, apiKey, cycle) {
  const data = await fecGet(
    `/candidate/${fecCandidateId}/committees/`,
    { cycle, designation: "P" },
    apiKey
  );
  return data.results?.[0]?.committee_id || null;
}

// Committee id lookups are cheap and stable (not an aggregation query),
// so these get the long TTL unconditionally, cached separately from the
// funders result so getSummary and getTopFunders can share it.
async function getPrincipalCommitteeId(fecCandidateId, apiKey, cycle) {
  const cacheKey = `fec-committee:${fecCandidateId}:${cycle}`;
  const cached = await getCached(cacheKey, DAY_MS);
  if (cached) return cached.committeeId;

  const committeeId = await findPrincipalCommitteeId(fecCandidateId, apiKey, cycle);
  await setCached(cacheKey, { committeeId });
  return committeeId;
}

async function fetchTotals(fecCandidateId, apiKey, cycle) {
  const data = await fecGet(
    `/candidate/${fecCandidateId}/totals/`,
    { cycle, election_full: false },
    apiKey
  );
  return data.results?.[0] || null;
}

async function fetchTopEmployers(committeeId, apiKey, cycle) {
  const data = await fecGet(
    "/schedules/schedule_a/by_employer/",
    { committee_id: committeeId, cycle, sort: "-total", per_page: 3 },
    apiKey,
    { timeoutMs: AGGREGATION_TIMEOUT_MS }
  );
  return (data.results || [])
    .filter((r) => r.employer)
    .map((r) => ({ employer: r.employer, amount: r.total || 0 }));
}

async function fetchTopCommittees(committeeId, apiKey, cycle) {
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
  return [...totalsByContributor.values()].sort((a, b) => b.amount - a.amount).slice(0, 3);
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

  let committeeId;
  try {
    committeeId = await getPrincipalCommitteeId(legislator.fecCandidateId, apiKey, cycle);
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

  if (!committeeId) {
    const result = { topCommittees: [], topEmployers: [] };
    await setCached(cacheKey, result);
    return result;
  }

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
