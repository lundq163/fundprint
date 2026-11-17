// Content script: finds candidate names in the page's text and wraps them
// in an underlined span. Runs on every page (see manifest + LIMITATIONS.md
// for why, during the beta) but does no network calls itself — matching
// happens entirely against the bundled legislators.json file. Messages
// only ever go to the popup (reporting a match count) or to our own
// background worker (the hover card, in card.js, asking for a summary) —
// never to anywhere outside the extension.
//
// Loaded as a classic script (content_scripts don't support ES modules
// directly), but it dynamically imports the real ES modules it depends on
// — that's a well-supported way to reuse module code from a content
// script without duplicating it.
//
// The global/per-site on/off toggle works live, not just on page reload:
// flipping it in the popup is reflected here via chrome.storage.onChanged.
// To keep the "never do unnecessary work" performance goal even with that,
// the heavier dependencies (the ~1800-variant matcher, the hover card
// module) are loaded lazily on first actual need, not unconditionally at
// startup — a page that's disabled the whole time it's open never pays
// for them.

if (window.__fundprintInjected) {
  // Defensive guard; MV3 shouldn't normally inject twice into one frame.
} else {
  window.__fundprintInjected = true;
  main();
}

async function main() {
  const { getGlobalEnabled, isSiteEnabled } = await import(chrome.runtime.getURL("common/storage.js"));

  let matchCount = 0;
  let disabled = !(await getGlobalEnabled()) || !(await isSiteEnabled(location.hostname));

  // Always answer the popup's count query, even when disabled, so the UI
  // can say so rather than just showing a stale/empty count.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "FUNDPRINT_GET_MATCH_COUNT") {
      sendResponse({ count: matchCount, disabled });
    }
  });

  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION"]);
  let seen = new WeakSet(); // text nodes already scanned, so repeat mutation batches don't redo work

  let matcher = null;
  let closeCard = null;
  let legislatorById = null; // only for ambiguous matches — see wrapMatches
  let depsLoadedPromise = null;

  function ensureDeps() {
    if (!depsLoadedPromise) {
      depsLoadedPromise = Promise.all([
        fetch(chrome.runtime.getURL("data/legislators.json")).then((r) => r.json()),
        import(chrome.runtime.getURL("common/matcher.js")),
        import(chrome.runtime.getURL("content/card.js")),
      ]).then(([legislators, { buildMatcher }, card]) => {
        matcher = buildMatcher(legislators.map((l) => ({ id: l.id, names: l.names })));
        legislatorById = new Map(
          legislators.map((l) => [
            l.id,
            { id: l.id, name: `${l.first} ${l.last}`, party: l.party, state: l.state, district: l.district, chamber: l.chamber },
          ])
        );
        closeCard = card.closeCard;
        card.initHoverCard();
      });
    }
    return depsLoadedPromise;
  }

  function isOwnNode(node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      return node.classList?.contains("fundprint-match") || !!node.closest?.(".fundprint-match");
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return !!node.parentElement?.closest(".fundprint-match");
    }
    return false;
  }

  // skipOwnNodeCheck: the very first full-page scan runs before any
  // .fundprint-match span exists, so parent.closest(".fundprint-match")
  // is guaranteed to walk all the way to <body> and find nothing for
  // every single node — wasted work on exactly the pass most likely to
  // be large (a long article's first scan). Incremental (mutation-
  // triggered) scans still need the check, since they can see our own
  // freshly-inserted spans.
  function collectTextNodes(root, skipOwnNodeCheck = false) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
        if (!skipOwnNodeCheck && parent.closest(".fundprint-match")) return NodeFilter.FILTER_REJECT;
        if (seen.has(node)) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  function wrapMatches(textNode, matches) {
    const text = textNode.nodeValue;
    const frag = document.createDocumentFragment();
    let cursor = 0;
    for (const m of matches) {
      if (m.start > cursor) {
        frag.appendChild(document.createTextNode(text.slice(cursor, m.start)));
      }
      const span = document.createElement("span");
      span.className = "fundprint-match";
      span.dataset.fundprintIds = m.ids.join(",");
      span.dataset.fundprintName = m.text;
      if (m.ids.length > 1) {
        // Ambiguous match (e.g. "Rep. Garcia" — several current House
        // members share that surname). card.js shows a picker rather than
        // guessing; it needs enough to tell the candidates apart, which a
        // bare id doesn't provide, so attach it now while we have the
        // full legislator list in hand.
        span.dataset.fundprintCandidates = JSON.stringify(
          m.ids.map((id) => legislatorById.get(id)).filter(Boolean)
        );
      }
      // Focusable so keyboard users can reach it; card.js handles what
      // happens on hover/focus. The ARIA attributes tell assistive tech
      // this is an interactive control that opens a dialog, not just a
      // plain name — without them, a screen reader would read the name
      // and nothing else, with no hint that anything is interactive here.
      // aria-expanded is kept in sync by card.js as the card opens/closes.
      span.tabIndex = 0;
      span.setAttribute("role", "button");
      span.setAttribute("aria-haspopup", "dialog");
      span.setAttribute("aria-expanded", "false");
      span.setAttribute("aria-label", `${m.text} — campaign funding info`);
      span.textContent = m.text;
      frag.appendChild(span);
      cursor = m.end;
    }
    if (cursor < text.length) {
      frag.appendChild(document.createTextNode(text.slice(cursor)));
    }
    textNode.replaceWith(frag);
  }

  function processQueue(nodes) {
    let i = 0;
    function step(deadline) {
      while (i < nodes.length && (deadline.timeRemaining() > 0 || deadline.didTimeout)) {
        const node = nodes[i++];
        if (!node.isConnected) continue;
        seen.add(node);
        const matches = matcher.findMatches(node.nodeValue);
        if (matches.length > 0) {
          matchCount += matches.length;
          wrapMatches(node, matches);
        }
      }
      if (i < nodes.length) {
        requestIdleCallback(step, { timeout: 500 });
      }
    }
    requestIdleCallback(step, { timeout: 500 });
  }

  // --- Watching for dynamically loaded content, start/stoppable so the
  //     toggle can turn it off and back on without a page reload ---
  const DEBOUNCE_MS = 250;
  const MAX_WAIT_MS = 2000; // see comment below

  let observer = null;
  const pendingRoots = new Set();
  let debounceTimer = null;
  let pendingSince = null;

  function startObserving() {
    if (observer) return;
    observer = new MutationObserver((mutationList) => {
      for (const mutation of mutationList) {
        for (const node of mutation.addedNodes) {
          pendingRoots.add(node);
        }
        if (mutation.type === "characterData") {
          pendingRoots.add(mutation.target);
        }
      }
      if (pendingSince === null) pendingSince = Date.now();
      clearTimeout(debounceTimer);
      // A page with continuous churn (a live blog, a ticking widget) keeps
      // resetting this debounce, which could otherwise delay scanning
      // indefinitely. Once we've been waiting more than MAX_WAIT_MS, scan
      // immediately instead of pushing the deadline out again.
      const waitedAlready = Date.now() - pendingSince;
      const delay = waitedAlready >= MAX_WAIT_MS ? 0 : DEBOUNCE_MS;
      debounceTimer = setTimeout(runPendingScan, delay);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function stopObserving() {
    observer?.disconnect();
    observer = null;
    clearTimeout(debounceTimer);
    pendingRoots.clear();
    pendingSince = null;
  }

  function runPendingScan() {
    const roots = [...pendingRoots];
    pendingRoots.clear();
    pendingSince = null;
    const textNodes = [];
    for (const root of roots) {
      if (!root.isConnected || isOwnNode(root)) continue;
      if (root.nodeType === Node.TEXT_NODE) {
        if (!seen.has(root) && root.nodeValue && root.nodeValue.trim()) {
          textNodes.push(root);
        }
      } else if (root.nodeType === Node.ELEMENT_NODE) {
        textNodes.push(...collectTextNodes(root));
      }
    }
    if (textNodes.length > 0) {
      processQueue(textNodes);
    }
  }

  function unwrapMatches() {
    for (const span of document.querySelectorAll(".fundprint-match")) {
      span.replaceWith(document.createTextNode(span.textContent));
    }
    seen = new WeakSet();
    matchCount = 0;
  }

  async function enableScanning() {
    await ensureDeps();
    if (disabled) return; // toggled off again before this finished loading
    processQueue(collectTextNodes(document.body, /* skipOwnNodeCheck */ true));
    startObserving();
  }

  function disableScanning() {
    stopObserving();
    closeCard?.();
    if (matcher) unwrapMatches(); // nothing to unwrap if deps never loaded
  }

  if (!disabled) {
    enableScanning();
  }

  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== "local") return;
    if (!("globalEnabled" in changes) && !("siteEnabled" in changes)) return;

    const newDisabled = !(await getGlobalEnabled()) || !(await isSiteEnabled(location.hostname));
    if (newDisabled === disabled) return;
    disabled = newDisabled;

    if (disabled) {
      disableScanning();
    } else {
      enableScanning();
    }
  });
}
