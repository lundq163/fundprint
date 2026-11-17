// Shared lookup of the bundled legislator list by id. Given a bioguide id
// (what matched spans carry), get back the name/party/state/chamber/
// FEC-candidate-id metadata needed to build a summary.

let loadPromise = null;

function load() {
  if (!loadPromise) {
    loadPromise = fetch(chrome.runtime.getURL("data/legislators.json"))
      .then((r) => r.json())
      .then((list) => new Map(list.map((l) => [l.id, l])));
  }
  return loadPromise;
}

export async function getLegislator(id) {
  const byId = await load();
  return byId.get(id) || null;
}
