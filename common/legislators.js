// Shared lookup of the bundled legislator list, by bioguide id (what
// matched spans carry) or by FEC candidate id (what raw FEC records carry
// — needed to link "which candidates has this committee given to most"
// on the funder detail page back to our own candidate detail page, when
// the recipient happens to be a current member of Congress).

let loadPromise = null;

function load() {
  if (!loadPromise) {
    loadPromise = fetch(chrome.runtime.getURL("data/legislators.json")).then((r) => r.json());
  }
  return loadPromise;
}

let byIdPromise = null;
function loadById() {
  if (!byIdPromise) {
    byIdPromise = load().then((list) => new Map(list.map((l) => [l.id, l])));
  }
  return byIdPromise;
}

let byFecIdPromise = null;
function loadByFecId() {
  if (!byFecIdPromise) {
    byFecIdPromise = load().then(
      (list) => new Map(list.filter((l) => l.fecCandidateId).map((l) => [l.fecCandidateId, l]))
    );
  }
  return byFecIdPromise;
}

export async function getLegislator(id) {
  const byId = await loadById();
  return byId.get(id) || null;
}

export async function getLegislatorByFecId(fecCandidateId) {
  const byFecId = await loadByFecId();
  return byFecId.get(fecCandidateId) || null;
}
