# Roadmap

## v1 — built

- Current US House and Senate members only (see LIMITATIONS.md for why
  presidential candidates aren't included yet).
- Name detection against a bundled list built from the
  unitedstates/congress-legislators dataset.
- Hover card with a funding summary, sourced live from the OpenFEC API,
  cached, with a loading spinner and all error states (missing/invalid
  key, rate-limited, no data found, partial-unavailable sections).
- Candidate and funder (PAC/committee) detail pages in new tabs, with a
  funding-breakdown chart on the candidate page.
- Right-click "Look up funding" fallback on selected text.
- Per-site and global on/off switches — live, no reload needed.
- Users supply their own free FEC API key.
- A keyboard/screen-reader accessibility pass (ARIA roles on matched
  names, focus management, color-contrast fixes) and a couple of
  performance hardenings for long/dynamic pages (see commit history for
  Milestone 7 specifics).
- Name disambiguation picker in the hover card: when a matched name
  belongs to more than one current legislator (e.g. "Rep. Garcia"), it
  lists them (with office/party) instead of guessing. The right-click
  fallback can't show an interactive picker, so it notifies with the
  possibilities and points to the hover card instead (see
  LIMITATIONS.md).

Not published to the Chrome Web Store yet — see below.

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
  not a rewrite, once the proxy exists. A server-side cache shared across
  all users would also help with the next item below — the first person
  to hit a slow case would absorb that wait once, not every user
  individually.
- **Faster/more reliable top-funder breakdowns for high-volume
  campaigns.** Some committees' Schedule A aggregation queries time out
  on FEC's own servers (see LIMITATIONS.md). Current mitigation is a
  client-side 8s timeout plus a short-TTL cache of the "unavailable"
  outcome; worth revisiting once there's a proxy (see above) or a
  different aggregation strategy.
- **Switch to click-to-activate (decided 2026-11-19).** Before a public
  Chrome Web Store listing, drop the always-on `<all_urls>` content
  script in favor of click-to-activate (the user clicks the toolbar icon
  to turn Fundprint on for that tab, granted via `activeTab` /
  `optional_host_permissions` rather than a blanket content script).
  Chosen over "optional host permissions you grant once per site" to
  minimize both the permission footprint and the Web Store review
  scrutiny that `<all_urls>` draws — not yet implemented.
- **State and local races.**
- **New entity types beyond politicians** (e.g. companies), via new data
  providers behind the same matcher/provider/UI architecture.
- **Firefox / Edge support.**
- **Chrome Web Store listing.** See the submission checklist (shared
  separately) for the full asset/policy/review requirements — this is
  blocked on the click-to-activate switch above.
