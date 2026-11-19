import { describe, it, expect } from "vitest";
import { buildMatcher } from "../common/matcher.js";

describe("buildMatcher", () => {
  it("matches a full name exactly", () => {
    const matcher = buildMatcher([{ id: "S1", names: ["Bernie Sanders"] }]);
    const matches = matcher.findMatches("Bernie Sanders spoke today.");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ text: "Bernie Sanders", ids: ["S1"], start: 0, end: 14 });
  });

  it("is case-sensitive", () => {
    const matcher = buildMatcher([{ id: "S1", names: ["Bernie Sanders"] }]);
    expect(matcher.findMatches("bernie sanders spoke today.")).toHaveLength(0);
  });

  it("never matches a bare last name alone", () => {
    // Only "Rep. Smith" is a registered variant — "Smith" by itself must
    // never match, per the MVP's explicit name-matching rule.
    const matcher = buildMatcher([{ id: "H1", names: ["Rep. Smith"] }]);
    expect(matcher.findMatches("A spokesperson named Smith declined to comment.")).toHaveLength(0);
  });

  it("respects word boundaries (does not match as part of a longer word)", () => {
    // Straight from the module's own doc comment: "Mark" must not match
    // inside "Markley" — i.e. a literal match adjacent to another word
    // character on either side must still be rejected.
    const matcher = buildMatcher([{ id: "H1", names: ["Mark"] }]);
    expect(matcher.findMatches("Markley Green is unrelated.")).toHaveLength(0);
    expect(matcher.findMatches("xMark spoke.")).toHaveLength(0);
    expect(matcher.findMatches("Mark spoke.")).toHaveLength(1);
  });

  it("reports every id when a name string is shared by multiple entities", () => {
    const matcher = buildMatcher([
      { id: "H1", names: ["Rep. Garcia"] },
      { id: "H2", names: ["Rep. Garcia"] },
    ]);
    const matches = matcher.findMatches("Rep. Garcia introduced the bill.");
    expect(matches).toHaveLength(1);
    expect(matches[0].ids.sort()).toEqual(["H1", "H2"]);
  });

  it("finds multiple distinct matches in one string with correct offsets", () => {
    const matcher = buildMatcher([
      { id: "S1", names: ["Bernie Sanders"] },
      { id: "S2", names: ["Elizabeth Warren"] },
    ]);
    const text = "Bernie Sanders and Elizabeth Warren spoke.";
    const matches = matcher.findMatches(text);
    expect(matches.map((m) => m.text)).toEqual(["Bernie Sanders", "Elizabeth Warren"]);
    for (const m of matches) {
      expect(text.slice(m.start, m.end)).toBe(m.text);
    }
  });

  it("escapes regex special characters in names (e.g. the period in 'Rep.')", () => {
    const matcher = buildMatcher([{ id: "H1", names: ["Rep. Aderholt"] }]);
    expect(matcher.findMatches("Rep. Aderholt voted yes.")).toHaveLength(1);
    // A regex-unsafe name must not behave like a wildcard: "Rep" followed
    // by any single character would otherwise also match "RepX Aderholt".
    expect(matcher.findMatches("RepX Aderholt voted yes.")).toHaveLength(0);
  });

  it("prefers the longest matching variant when one is a prefix of another", () => {
    const matcher = buildMatcher([
      { id: "H1", names: ["Robert Aderholt", "Robert B. Aderholt"] },
    ]);
    const matches = matcher.findMatches("Robert B. Aderholt spoke.");
    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe("Robert B. Aderholt");
  });

  it("returns no matches for an empty entity list", () => {
    const matcher = buildMatcher([]);
    expect(matcher.findMatches("Bernie Sanders spoke today.")).toEqual([]);
  });
});
