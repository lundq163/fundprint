// Generic text-matching layer. Deliberately knows nothing about politics —
// it just finds occurrences of a bundled list of "entities" (each with one
// or more literal name strings) inside a block of text. This is what lets
// Fundprint add other entity types (e.g. companies) later: they'd ship a
// different bundled list in the same { id, names: [...] } shape and reuse
// this same matcher.
//
// Matching rules (see MVP spec's "name-matching edge cases"):
//  - Case-sensitive, so we don't light up lowercase prose mentions of an
//    unrelated common word that happens to equal a name.
//  - Whole-word boundaries only ("Mark" must not match inside "Markley").
//  - If a single name string belongs to more than one entity (e.g. two
//    Representatives named "Rep. Garcia"), a match reports ALL of their
//    ids so the UI can show a picker instead of guessing.

/**
 * @param {Array<{id: string, names: string[]}>} entities
 * @returns {{ findMatches: (text: string) => Array<{start: number, end: number, text: string, ids: string[]}> }}
 */
export function buildMatcher(entities) {
  // name string -> set of entity ids that use it
  const idsByName = new Map();
  for (const entity of entities) {
    for (const name of entity.names) {
      if (!idsByName.has(name)) {
        idsByName.set(name, new Set());
      }
      idsByName.get(name).add(entity.id);
    }
  }

  // Longest names first, so e.g. "Robert B. Aderholt" wins over a shorter
  // variant that happens to be a prefix of it, before regex alternation
  // can short-circuit on the shorter one.
  const allNames = [...idsByName.keys()].sort((a, b) => b.length - a.length);

  const pattern =
    allNames.length === 0
      ? null
      : new RegExp(`\\b(${allNames.map(escapeRegExp).join("|")})\\b`, "g");

  function findMatches(text) {
    if (!pattern) return [];
    const matches = [];
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        ids: [...idsByName.get(match[0])],
      });
    }
    return matches;
  }

  return { findMatches };
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
