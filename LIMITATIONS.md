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
  also say "temporarily unavailable" — confirmed to happen because FEC's
  own servers can time out computing this for extremely high-volume
  campaigns (e.g. a sitting senator's committee, in testing). Fundprint
  gives up after 8 seconds rather than waiting on FEC's full ~30-second
  timeout, and remembers that outcome for an hour so repeat hovers don't
  wait again right away — but it can't make FEC's own query faster. See
  ROADMAP.md for a possible future fix (a proxy server that absorbs this
  wait once, server-side, instead of per user).
- **Funder detail pages are best-tested against traditional PACs.** FEC
  committee totals have a somewhat different shape for different
  committee types (traditional PAC vs. super PAC vs. party committee vs.
  a candidate's own authorized committee). Fundprint reads the common
  fields (receipts, disbursements, cash on hand) for all of them, but
  hasn't been verified against every type — some funder pages may show
  incomplete totals until this gets wider testing.
- **"Look up funding" can fail silently if OS/Chrome notifications are
  blocked.** When the right-click lookup finds no match, Fundprint's only
  feedback is a Chrome notification — if your system or browser has
  notifications turned off for Chrome, a no-match result looks like
  nothing happened at all. Check your OS's notification settings for
  Chrome if the context menu item seems unresponsive. (It should always
  do *something* — either open a tab or notify — so if you've confirmed
  notifications are allowed and it's still silent, that's a real bug;
  check the background service worker's console for a "Fundprint:"
  error and report it.)
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
  members share that surname), the hover card shows a picker listing
  them (with office/party) so you can choose — but the right-click
  "Look up funding" fallback can't show an interactive picker, so for an
  ambiguous selection it just lists the possibilities in a notification
  and asks you to use the hover card instead of guessing.
- **You need your own free API key during the beta.** Fundprint uses the
  official OpenFEC API, which requires a free key from api.data.gov. A
  future version may remove this requirement via a proxy server (see
  ROADMAP.md).
- **Accessibility pass was code-level, not tested with real assistive
  tech.** ARIA roles/labels, focus management, and color contrast were
  reviewed and fixed against WCAG guidelines and computed contrast
  ratios, but the result hasn't been tried with an actual screen reader
  (VoiceOver, NVDA, etc.). Please report anything that doesn't announce
  or behave as expected.
- **Performance hardening for long/dynamic pages hasn't been verified on
  real sites yet** (only reasoned through and fixed in code — e.g.
  skipping redundant checks on the first scan, bounding how long
  continuous page churn can delay scanning). Report any noticeable
  slowdown or jank on a specific site.
- **Runs on all sites during the beta.** As a deliberate, temporary
  choice, Fundprint's content script runs on every page you visit so it
  can look for candidate names anywhere. You can turn it off globally or
  per-site any time from the toolbar popup. Before a public Chrome Web
  Store launch, this will be revisited (e.g. optional/click-to-activate
  permissions) — see ROADMAP.md.
