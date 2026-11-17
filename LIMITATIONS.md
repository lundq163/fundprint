# Limitations

Plain-language caveats, kept up to date as Fundprint is built.

- **Currently covers sitting members of Congress only.** Fundprint's name
  list comes from current House and Senate members. Presidential and
  other declared candidates who aren't already in Congress aren't in the
  bundled list yet — there's no equivalent "current candidates" dataset
  to draw from the way there is for Congress, so this needs its own
  solution later. State and local races are out of scope entirely.
- **Only the current two-year cycle is shown.** Totals reflect the
  current election cycle's filings, not a member's full career
  fundraising.
- **FEC data lags reality.** Campaigns file periodically (not in real
  time), so the numbers you see reflect the most recent filing, not this
  minute's fundraising.
- **Top committees/employers are approximations for very high-volume
  campaigns.** "Top employers" comes from an FEC aggregate; "top
  contributing committees" doesn't have an equivalent aggregate endpoint,
  so it's approximated from the largest individual contributions on
  record (contribution limits per PAC are small, so this is normally very
  accurate, but it's not a guaranteed exact ranking). Either section can
  also say "temporarily unavailable" if the FEC's servers time out
  computing it — confirmed to happen for extremely high-volume campaigns.
- **"Dark money" isn't traceable.** Some groups (certain nonprofits and
  other entities) aren't required to disclose their donors. When a
  funding trail reaches one of these groups, it ends there — Fundprint
  can't show what it doesn't have.
- **No industry categorization yet.** Contributions are grouped by
  committee/PAC and by individual donors' employer, but not yet rolled up
  into industries (e.g. "pharmaceuticals," "finance"). See ROADMAP.md.
- **Name matching isn't perfect.** It's possible for a name on a page to
  be missed, or for a match to be incorrect. When multiple candidates
  share a matched name (e.g. "Rep. Garcia" — several current House
  members share that surname), Fundprint currently just shows data for
  one of them rather than asking which one — a disambiguation picker is
  planned but not built yet.
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
