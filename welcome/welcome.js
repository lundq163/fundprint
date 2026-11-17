// Just opens the options page in the same tab when the link is clicked,
// using the extension API (a plain href to a chrome-extension:// URL also
// works, but this keeps navigation explicit and testable).

document.getElementById("open-options").addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});
