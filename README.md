# Fundprint

Fundprint is a nonpartisan browser extension. While enabled, it detects the
names of US federal candidates and members of Congress on the pages you
browse and gives them a subtle underline. Hovering over an underlined name
shows a popup card summarizing how that candidate's campaign is funded,
sourced from official FEC (Federal Election Commission) filings via the
[OpenFEC API](https://api.open.fec.gov/developers/). Clicking items in the
card opens a detailed breakdown in a new tab: the candidate's full funding,
or a specific funder (e.g. a PAC) and who funds *it*.

Fundprint presents facts only. It does not label, score, or rate candidates,
and treats every candidate and party identically.

**Status:** MVP feature-complete; not yet published to the Chrome Web Store.

## Setup (developer / beta testing)

1. Get a free API key at [api.data.gov/signup](https://api.data.gov/signup/).
   This key is yours alone, stored only on your device, and is used to
   query the FEC's official API.
2. Load the extension:
   - Open `chrome://extensions` in Chrome.
   - Enable **Developer mode** (top right).
   - Click **Load unpacked** and select this project folder.
3. Click the Fundprint toolbar icon, then **Options**, and paste in your
   API key.

## How to use it

- Fundprint is on by default on every site (see [LIMITATIONS.md](LIMITATIONS.md)
  for why, during this beta). Use the toolbar popup to turn it off globally
  or for the current site.
- Hover over an underlined name to see a funding summary. Click items in
  the card to open a full breakdown in a new tab.
- Select any text and right-click to use **Look up funding** as a fallback
  if a name isn't automatically underlined.
- Keyboard accessible: Tab to a name to open its card immediately, Tab
  again to reach the card's buttons, Shift+Tab to go back to the name,
  and Esc to close it from anywhere.

## Data sources

- [OpenFEC API](https://api.open.fec.gov/developers/) — official FEC data,
  queried live, cached locally for up to 24 hours.
- [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators)
  (CC0-1.0 / public domain) — the bundled list of current federal
  legislators and their FEC candidate IDs, used for name matching.
  Regenerate `data/legislators.json` any time with:
  ```
  pip3 install pyyaml
  python3 scripts/build_legislators.py
  ```

## Privacy

- Fundprint stores no user data and no browsing history. There is no
  analytics and no tracking of any kind.
- Page text is scanned and matched **entirely on your device**. It is never
  sent anywhere. Only candidate/committee IDs are sent to the FEC API, to
  look up their public funding data.
- The only things ever stored (in `chrome.storage.local`, on your device
  only) are: your FEC API key, and your on/off preferences.
- Individual donors' names and addresses are never displayed. Individual
  contributions are grouped by employer only.

## Permissions

What each permission in `manifest.json` is for, and roughly what the
Chrome Web Store shows users about it (exact wording varies by Chrome
version — this is the gist):

| Permission | Why Fundprint needs it | What the Web Store tells users |
|---|---|---|
| `storage` | Save your API key and on/off preferences locally. | No warning shown — considered low-risk. |
| `activeTab` | Read the current tab's URL only when you click the toolbar icon, so the popup can show/toggle the right site. | No warning shown — access is limited to the moment you invoke the extension. |
| `contextMenus` | Add the "Look up funding" right-click menu item. | No warning shown. |
| `notifications` | Show a notification when "Look up funding" can't find a match. | May be listed as "Display notifications." |
| `host_permissions` (`https://api.open.fec.gov/*`) | Call the official FEC API directly from the background worker. | Something like "Read and change your data on api.open.fec.gov." |
| `content_scripts` matches (`<all_urls>`) | Scan page text for candidate names on every site, as a deliberate beta choice (see LIMITATIONS.md). | **The big one** — "Read and change all your data on all websites." This is the permission most worth scrutinizing before installing, and the one we plan to revisit before a public launch (see ROADMAP.md). |

`web_accessible_resources` isn't a user-facing permission — it's a manifest
detail that lets the content script load a few of the extension's own
bundled files (the matcher, the legislator list, the hover card module).

## Testing

Unit tests cover the non-DOM logic — name matching, settings storage, the
legislator lookup, and the FEC provider's request/caching/field-mapping
logic (`common/`, `providers/`). Content-script/DOM code (`content/`) and
the detail pages aren't covered yet; see
[#12](https://github.com/lundq163/fundprint/issues/12) for what's still
manual-only.

```
npm install
npm test
```

Runs automatically on every push/PR via GitHub Actions
(`.github/workflows/test.yml`).

## License

[MIT](LICENSE).

## Project status

The MVP feature set described above is built: name detection, the hover
card with real FEC data and caching, candidate/funder detail tabs, the
right-click fallback, per-site/global toggles, and an accessibility pass.
See the commit history for how it was built milestone by milestone. It
hasn't been published to the Chrome Web Store yet — see
[ROADMAP.md](ROADMAP.md) for what's planned before/after that, and
[LIMITATIONS.md](LIMITATIONS.md) for current caveats.
