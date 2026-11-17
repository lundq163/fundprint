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

if (window.__fundprintInjected) {
  // Defensive guard; MV3 shouldn't normally inject twice into one frame.
} else {
  window.__fundprintInjected = true;
  main();
}

async function main() {
  const [{ buildMatcher }, { getGlobalEnabled, isSiteEnabled }] = await Promise.all([
    import(chrome.runtime.getURL("common/matcher.js")),
    import(chrome.runtime.getURL("common/storage.js")),
  ]);

  const [globalEnabled, siteEnabled] = await Promise.all([
    getGlobalEnabled(),
    isSiteEnabled(location.hostname),
  ]);

  let matchCount = 0;
  const disabled = !globalEnabled || !siteEnabled;

  // Always answer the popup's count query, even when disabled, so the UI
  // can say so rather than just showing a stale/empty count.
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "FUNDPRINT_GET_MATCH_COUNT") {
      sendResponse({ count: matchCount, disabled });
    }
  });

  if (disabled) return;

  const [legislators, { initHoverCard }] = await Promise.all([
    fetch(chrome.runtime.getURL("data/legislators.json")).then((r) => r.json()),
    import(chrome.runtime.getURL("content/card.js")),
  ]);
  const matcher = buildMatcher(legislators.map((l) => ({ id: l.id, names: l.names })));
  initHoverCard();

  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION"]);
  const seen = new WeakSet(); // text nodes already scanned, so repeat mutation batches don't redo work

  function isOwnNode(node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      return node.classList?.contains("fundprint-match") || !!node.closest?.(".fundprint-match");
    }
    if (node.nodeType === Node.TEXT_NODE) {
      return !!node.parentElement?.closest(".fundprint-match");
    }
    return false;
  }

  function collectTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
        if (parent.closest(".fundprint-match")) return NodeFilter.FILTER_REJECT;
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
      // Focusable so keyboard users can reach it; card.js handles what
      // happens on hover/focus.
      span.tabIndex = 0;
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

  // --- Initial scan of the whole page ---
  processQueue(collectTextNodes(document.body));

  // --- Keep scanning content that loads in later ---
  const pendingRoots = new Set();
  let debounceTimer = null;

  const observer = new MutationObserver((mutationList) => {
    for (const mutation of mutationList) {
      for (const node of mutation.addedNodes) {
        pendingRoots.add(node);
      }
      if (mutation.type === "characterData") {
        pendingRoots.add(mutation.target);
      }
    }
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runPendingScan, 250);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  function runPendingScan() {
    const roots = [...pendingRoots];
    pendingRoots.clear();
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
}
