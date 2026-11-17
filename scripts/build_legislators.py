#!/usr/bin/env python3
"""
Regenerates data/legislators.json, the bundled name list the content script
matches page text against.

Source: the unitedstates/congress-legislators project
(https://github.com/unitedstates/congress-legislators), specifically
legislators-current.yaml — current members of the US House and Senate.
License: CC0-1.0 (public domain; no attribution required, but we credit it
anyway in README.md since it's good practice and the data may update).

For each legislator we precompute the literal strings the content script
should look for on a page ("name variants"): their plain full name, their
nickname-based name if they go by one, their official full name (which may
include a middle initial / suffix), and a title + last name form using the
correct title for their current chamber ("Rep." / "Sen."). We deliberately
never generate a bare last-name-only variant — matching on a common last
name alone causes false positives (see MVP spec's name-matching edge cases).

We also resolve which of a legislator's possibly-multiple historical FEC
candidate IDs corresponds to their *current* seat, since someone who has
run for both the House and Senate over their career accumulates one FEC
candidate ID per office. FEC candidate IDs are prefixed by office type
("H" = House, "S" = Senate, "P" = President), so we pick the ID matching
their current chamber. This is a heuristic, not official FEC metadata —
worth re-checking if a candidate's summary ever looks wrong.

Usage:
    python3 scripts/build_legislators.py
"""

import json
import sys
import urllib.request
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("This script needs PyYAML. Install it with: pip3 install pyyaml")

SOURCE_URL = (
    "https://raw.githubusercontent.com/unitedstates/congress-legislators/"
    "main/legislators-current.yaml"
)
OUTPUT_PATH = Path(__file__).resolve().parent.parent / "data" / "legislators.json"

CHAMBER_TITLES = {
    "rep": ["Rep.", "Representative"],
    "sen": ["Sen.", "Senator"],
}
CHAMBER_FEC_PREFIX = {
    "rep": "H",
    "sen": "S",
}


def fetch_source():
    print(f"Downloading {SOURCE_URL} ...")
    with urllib.request.urlopen(SOURCE_URL) as response:
        return yaml.safe_load(response)


def build_name_variants(name, title_words):
    first = name["first"]
    last = name["last"]
    variants = {f"{first} {last}"}

    official_full = name.get("official_full")
    if official_full:
        variants.add(official_full)

    nickname = name.get("nickname")
    if nickname and nickname != first:
        variants.add(f"{nickname} {last}")

    for title in title_words:
        variants.add(f"{title} {last}")

    return sorted(variants)


def resolve_fec_id(fec_ids, chamber):
    if not fec_ids:
        return None
    prefix = CHAMBER_FEC_PREFIX.get(chamber)
    for fec_id in fec_ids:
        if prefix and fec_id.startswith(prefix):
            return fec_id
    # Fallback: no ID matches the expected prefix (unexpected data shape).
    return fec_ids[-1]


def build_entry(raw):
    bioguide = raw["id"].get("bioguide")
    if not bioguide:
        return None  # need a stable id; skip the rare record without one

    current_term = raw["terms"][-1]
    chamber = current_term["type"]
    if chamber not in CHAMBER_TITLES:
        return None  # not a House or Senate seat (MVP scope is federal legislators)

    fec_ids = raw["id"].get("fec") or []
    fec_id = resolve_fec_id(fec_ids, chamber)

    names = build_name_variants(raw["name"], CHAMBER_TITLES[chamber])

    return {
        "id": bioguide,
        "names": names,
        "first": raw["name"]["first"],
        "last": raw["name"]["last"],
        "party": current_term.get("party"),
        "state": current_term.get("state"),
        "district": current_term.get("district"),  # present for House, absent for Senate
        "chamber": chamber,
        "fecCandidateId": fec_id,
        "fecCandidateIds": fec_ids,
    }


def main():
    raw_legislators = fetch_source()
    entries = [e for e in (build_entry(r) for r in raw_legislators) if e]
    entries.sort(key=lambda e: (e["last"], e["first"]))

    OUTPUT_PATH.parent.mkdir(exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(entries, f, indent=2)
        f.write("\n")

    total_variants = sum(len(e["names"]) for e in entries)
    print(f"Wrote {len(entries)} legislators ({total_variants} name variants) to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
