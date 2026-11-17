# Limitations

Plain-language caveats, kept up to date as Fundprint is built.

- **Federal only.** Fundprint currently covers US House, Senate, and
  presidential candidates. State and local races are not covered yet.
- **FEC data lags reality.** Campaigns file periodically (not in real
  time), so the numbers you see reflect the most recent filing, not this
  minute's fundraising.
- **"Dark money" isn't traceable.** Some groups (certain nonprofits and
  other entities) aren't required to disclose their donors. When a
  funding trail reaches one of these groups, it ends there — Fundprint
  can't show what it doesn't have.
- **No industry categorization yet.** Contributions are grouped by
  committee/PAC and by individual donors' employer, but not yet rolled up
  into industries (e.g. "pharmaceuticals," "finance"). See ROADMAP.md.
- **Name matching isn't perfect.** It's possible for a name on a page to
  be missed, or for a match to be incorrect (e.g. two people who share a
  name). When multiple candidates share a name, Fundprint shows a picker
  instead of guessing.
- **You need your own free API key during the beta.** Fundprint uses the
  official OpenFEC API, which requires a free key from api.data.gov. A
  future version may remove this requirement via a proxy server (see
  ROADMAP.md).
- **Runs on all sites during the beta.** As a deliberate, temporary
  choice, Fundprint's content script runs on every page you visit so it
  can look for candidate names anywhere. You can turn it off globally or
  per-site any time from the toolbar popup. Before a public Chrome Web
  Store launch, this will be revisited (e.g. optional/click-to-activate
  permissions) — see ROADMAP.md.
