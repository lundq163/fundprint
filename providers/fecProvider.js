// Real FEC-backed data provider: getSummary(id) -> normalized summary.
// background.js is the only thing that calls this.
//
// Getting a candidate's summary takes a few FEC API calls:
//   1. Find their current-cycle principal campaign committee id
//      (committees are where money is actually itemized; candidates
//      themselves aren't).
//   2. Get their official aggregated totals (the authoritative numbers
//      for the raised/cash-on-hand/individuals-vs-PACs-vs-self split).
//   3. Get their top individual-donor employers (FEC aggregates this
//      server-side via schedule_a/by_employer).
//   4. Approximate their top contributing committees/PACs — there's no
//      server-side aggregation endpoint for this, so we pull the 100
//      largest committee-type Schedule A records for their committee and
//      sum by contributor. Since PAC-to-candidate contributions are
//      capped by law to a few thousand dollars each, the top real
//      contributors almost always show up within the 100 largest
//      transactions, so this is a solid approximation, not a literal
//      full-cycle aggregate.
//
// Steps 3 and 4 are fetched with Promise.allSettled and can fail
// independently without breaking the whole summary — confirmed necessary
// in practice: schedule_a/by_employer genuinely times out server-side for
// very high-volume committees (seen testing against a sitting senator's
// committee), and that shouldn't take down the totals we already have.

import { fecGet, FecApiError } from "./fecClient.js";
import { getApiKey } from "../common/storage.js";
import { getLegislator } from "../common/legislators.js";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function currentCycle() {
  const year = new Date().getFullYear();
  return year % 2 === 0 ? year : year + 1;
}

async function getCached(key) {
  const stored = await chrome.storage.session.get(key);
  const entry = stored[key];
  if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
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
    apiKey
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
    apiKey
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
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  let committeeId;
  let totals;
  try {
    [committeeId, totals] = await Promise.all([
      findPrincipalCommitteeId(legislator.fecCandidateId, apiKey, cycle),
      fetchTotals(legislator.fecCandidateId, apiKey, cycle),
    ]);
  } catch (err) {
    return errorResult(err, id);
  }

  if (!totals) {
    return { notFound: true, id };
  }

  const [employersResult, committeesResult] = committeeId
    ? await Promise.allSettled([
        fetchTopEmployers(committeeId, apiKey, cycle),
        fetchTopCommittees(committeeId, apiKey, cycle),
      ])
    : [
        { status: "fulfilled", value: [] },
        { status: "fulfilled", value: [] },
      ];

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
    topEmployers: employersResult.status === "fulfilled" ? employersResult.value : [],
    topEmployersUnavailable: employersResult.status === "rejected",
    topCommittees: committeesResult.status === "fulfilled" ? committeesResult.value : [],
    topCommitteesUnavailable: committeesResult.status === "rejected",
    asOfDate: (totals.coverage_end_date || "").slice(0, 10),
    fecCandidateUrl: `https://www.fec.gov/data/candidate/${legislator.fecCandidateId}/`,
  };

  await setCached(cacheKey, summary);
  return summary;
}
