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

**Status:** early development (not yet published to the Chrome Web Store).

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

## Data sources

- [OpenFEC API](https://api.open.fec.gov/developers/) — official FEC data,
  queried live, cached locally for up to 24 hours.
- [unitedstates/congress-legislators](https://github.com/unitedstates/congress-legislators) —
  the bundled list of current federal legislators and their FEC candidate
  IDs, used for name matching. See `scripts/` for how this list is
  regenerated.

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

## Project status

This project is being built in milestones; see the commit history for
progress. See [ROADMAP.md](ROADMAP.md) for what's planned next and
[LIMITATIONS.md](LIMITATIONS.md) for current caveats.
