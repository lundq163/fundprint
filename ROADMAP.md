# Roadmap

## v1 (current focus)

- Federal candidates (House, Senate, President) only.
- Name detection against a bundled list built from the
  unitedstates/congress-legislators dataset.
- Hover card with a funding summary, sourced live from the OpenFEC API.
- Candidate and funder (PAC/committee) detail pages in new tabs.
- Right-click "Look up funding" fallback on selected text.
- Per-site and global on/off switches.
- Users supply their own free FEC API key.

## v2 and beyond

- **Industry categories.** Use OpenSecrets bulk data to roll committee and
  employer contributions up into industries (e.g. "pharmaceuticals,"
  "finance"). OpenSecrets data is CC BY-NC-SA (attribution required,
  non-commercial use only, share-alike) — confirm current license terms
  before using it. This requires hosting processed data on a server,
  since it can't ship as a static bundle the way the legislator list does.
- **Proxy server.** A small server (e.g. a Cloudflare Worker) that holds
  the FEC API key server-side and caches responses, so beta users don't
  need to get their own key. The network layer (`common/` provider) is
  already built with a configurable base URL so this is a config change,
  not a rewrite, once the proxy exists.
- **Revisit always-on activation.** Before a public Chrome Web Store
  listing, reconsider running on `<all_urls>` by default — e.g. optional
  host permissions, or click-to-activate per site.
- **State and local races.**
- **New entity types beyond politicians** (e.g. companies), via new data
  providers behind the same matcher/provider/UI architecture.
- **Better name disambiguation** (beyond the current same-name picker).
- **Firefox / Edge support.**
- **Chrome Web Store listing**, including store-review-ready copy for the
  `<all_urls>` permission justification.
