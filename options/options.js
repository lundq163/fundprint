import { getApiKey, setApiKey } from "../common/storage.js";

const form = document.getElementById("api-key-form");
const input = document.getElementById("api-key");
const status = document.getElementById("status");

// Pre-fill with the existing key (if any) so the user can see a key is
// already saved without re-pasting it.
getApiKey().then((key) => {
  input.value = key;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await setApiKey(input.value.trim());
  status.textContent = "Saved.";
  setTimeout(() => {
    status.textContent = "";
  }, 2000);
});
