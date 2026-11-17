// Mock data provider — stands in for the real FEC-backed provider that
// Milestone 4 will add alongside this file. Both will expose the same
// shape (getSummary(id) -> normalized summary object), which is the
// "data provider" layer described in the architecture notes: the UI only
// ever sees this normalized shape, never a raw API response. Swapping
// mock for real is meant to be a one-line change in background.js.
//
// Numbers here are synthetic (seeded by the legislator's id, so they're
// stable across reloads for easy testing) and clearly fake — the card UI
// labels them "Mock data" so nobody mistakes them for real FEC figures.

let legislatorsPromise = null;
function loadLegislators() {
  if (!legislatorsPromise) {
    legislatorsPromise = fetch(chrome.runtime.getURL("data/legislators.json")).then((r) =>
      r.json()
    );
  }
  return legislatorsPromise;
}

const COMMITTEE_NAME_POOL = [
  "Blue Horizon PAC",
  "National Forward Fund",
  "Grassroots Victory Committee",
  "United Action Network",
  "Main Street Alliance PAC",
];
const EMPLOYER_NAME_POOL = ["Self-Employed", "Retired", "Not Employed", "Attorney", "Software Engineer"];

// Small deterministic PRNG so the same id always produces the same mock
// numbers (mulberry32, seeded from a hash of the id string).
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function currentCycle() {
  const year = new Date().getFullYear();
  const end = year % 2 === 0 ? year : year + 1;
  return `${end - 1}–${end}`;
}

function buildMockSummary(legislator) {
  const rand = mulberry32(hashString(legislator.id));
  const isSenate = legislator.chamber === "sen";
  const raised = Math.round((isSenate ? 1_000_000 + rand() * 19_000_000 : 300_000 + rand() * 2_700_000) / 1000) * 1000;
  const cashOnHand = Math.round(raised * (0.05 + rand() * 0.35));

  const individualsShare = 0.5 + rand() * 0.25;
  const selfShare = rand() * 0.05;
  const committeesShare = Math.max(0, 1 - individualsShare - selfShare);

  const fromIndividuals = Math.round(raised * individualsShare);
  const fromCommittees = Math.round(raised * committeesShare);
  const selfFunding = raised - fromIndividuals - fromCommittees;

  const topCommittees = [0, 1, 2].map((i) => ({
    id: `MOCK-COMMITTEE-${legislator.id}-${i}`,
    name: COMMITTEE_NAME_POOL[(i + hashString(legislator.id)) % COMMITTEE_NAME_POOL.length],
    amount: Math.round((fromCommittees * (0.4 - i * 0.1)) / 100) * 100,
  }));

  const topEmployers = [0, 1, 2].map((i) => ({
    employer: EMPLOYER_NAME_POOL[(i + 1 + hashString(legislator.id)) % EMPLOYER_NAME_POOL.length],
    amount: Math.round((fromIndividuals * (0.3 - i * 0.08)) / 100) * 100,
  }));

  return {
    id: legislator.id,
    name: `${legislator.first} ${legislator.last}`,
    party: legislator.party,
    state: legislator.state,
    district: legislator.district,
    chamber: legislator.chamber,
    cycle: currentCycle(),
    totals: { raised, cashOnHand, fromIndividuals, fromCommittees, selfFunding },
    topCommittees,
    topEmployers,
    asOfDate: new Date().toISOString().slice(0, 10),
    fecCandidateUrl: legislator.fecCandidateId
      ? `https://www.fec.gov/data/candidate/${legislator.fecCandidateId}/`
      : null,
    isMock: true,
  };
}

export async function getSummary(id) {
  const legislators = await loadLegislators();
  const legislator = legislators.find((l) => l.id === id);
  if (!legislator) {
    return { notFound: true, id };
  }
  return buildMockSummary(legislator);
}
