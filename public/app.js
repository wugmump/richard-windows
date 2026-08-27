const gate = document.getElementById("identityGate");
const nameInput = document.getElementById("nameInput");
const identityError = document.getElementById("identityError");
const identityLabel = document.getElementById("identityLabel");
const messages = document.getElementById("messages");
const status = document.getElementById("status");
const content = document.getElementById("content");
const sendButton = document.getElementById("sendButton");
const offlineOverlay = document.getElementById("offlineOverlay");
const settingsDialog = document.getElementById("settingsDialog");
const settingsButton = document.getElementById("settingsButton");
const closeSettingsButton = document.getElementById("closeSettingsButton");
const settingsBody = document.getElementById("settingsBody");
const resetButton = document.getElementById("resetButton");
const fields = {
  backendURL: document.getElementById("backendURL"),
  modelName: document.getElementById("modelName"),
  joinCode: document.getElementById("joinCode"),
  assholeLevel: document.getElementById("assholeLevel"),
  maxContextMessages: document.getElementById("maxContextMessages"),
  maxTokens: document.getElementById("maxTokens"),
  temperature: document.getElementById("temperature")
};
const assholeValue = document.getElementById("assholeValue");

let userName = localStorage.richardName || "";
let code = sessionStorage.richardCode || new URLSearchParams(location.search).get("code") || "";
let isSubmitting = false;
let isEditingSettings = false;

requireName();
if (userName) requireCode();
refresh();
setInterval(refresh, 2000);
window.addEventListener("load", scrollMessagesToEnd);

document.getElementById("identityPanel").addEventListener("submit", (event) => {
  event.preventDefault();
  userName = nameInput.value.trim();
  if (!userName) {
    identityError.textContent = "Type a name. This is not optional.";
    nameInput.focus();
    return;
  }

  identityError.textContent = "";
  localStorage.richardName = userName;
  gate.classList.add("hidden");
  identityLabel.textContent = userName;
  requireCode();
  refresh();
  content.focus();
});

document.getElementById("composer").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isSubmitting || !requireName()) return;
  if (!code) requireCode();
  const text = content.value.trim();
  if (!text) return;

  setSubmitting(true);
  content.value = "";

  try {
    const response = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Richard-Code": code },
      body: JSON.stringify({ author: userName, content: text, code })
    });
    if (response.ok) {
      renderState(await response.json());
      return;
    }
    content.value = text;
  } catch {
    content.value = text;
    setOffline(true);
  } finally {
    setSubmitting(false);
  }
});

settingsButton.addEventListener("click", () => {
  isEditingSettings = true;
  if (typeof settingsDialog.showModal === "function") {
    settingsDialog.showModal();
  } else {
    settingsDialog.setAttribute("open", "");
  }
});

closeSettingsButton.addEventListener("click", () => {
  isEditingSettings = false;
  settingsDialog.close();
});

settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) {
    isEditingSettings = false;
    settingsDialog.close();
  }
});

fields.assholeLevel.addEventListener("input", () => {
  assholeValue.textContent = fields.assholeLevel.value;
});

settingsBody.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveSettings();
  isEditingSettings = false;
  settingsDialog.close();
});

resetButton.addEventListener("click", async () => {
  if (!confirm("Reset the shared conversation?")) return;
  await postJSON("/api/reset", { code });
  await refresh();
});

function requireName() {
  userName = userName.trim();
  if (!userName) {
    gate.classList.remove("hidden");
    nameInput.focus();
    return false;
  }

  localStorage.richardName = userName;
  identityLabel.textContent = userName;
  gate.classList.add("hidden");
  return true;
}

function requireCode() {
  if (!code) code = prompt("Join code") || "";
  sessionStorage.richardCode = code;
}

async function refresh() {
  if (!userName || !code) return;
  try {
    const response = await fetch(`/api/state?code=${encodeURIComponent(code)}`, { cache: "no-store" });
    if (!response.ok) {
      if (response.status >= 500) setOffline(true);
      return;
    }
    renderState(await response.json());
  } catch {
    setOffline(true);
  }
}

function renderState(payload) {
  setOffline(false);
  renderMessages(payload.messages || []);
  status.textContent = payload.isSending ? (payload.statusText || "Richard is thinking.") : "";
  if (!isEditingSettings) renderSettings(payload.settings || {});
}

function renderMessages(items) {
  messages.innerHTML = "";
  for (const item of items) {
    const wrapper = document.createElement("article");
    wrapper.className = `message ${item.role}`;

    const speaker = document.createElement("div");
    speaker.className = "speaker";
    speaker.textContent = item.author ? `${item.author} said:` : item.role;

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = item.content;

    wrapper.appendChild(speaker);
    wrapper.appendChild(bubble);
    messages.appendChild(wrapper);
  }
  scrollMessagesToEnd();
}

function renderSettings(settings) {
  for (const [key, field] of Object.entries(fields)) {
    if (settings[key] !== undefined && field !== document.activeElement) {
      field.value = settings[key];
    }
  }
  assholeValue.textContent = Math.round(Number(fields.assholeLevel.value) || 0);
}

async function saveSettings() {
  const payload = {
    code,
    backendURL: fields.backendURL.value,
    modelName: fields.modelName.value,
    joinCode: fields.joinCode.value,
    assholeLevel: Number(fields.assholeLevel.value),
    maxContextMessages: Number(fields.maxContextMessages.value),
    maxTokens: Number(fields.maxTokens.value),
    temperature: Number(fields.temperature.value)
  };
  const state = await postJSON("/api/settings", payload);
  if (payload.joinCode && payload.joinCode !== code) {
    code = payload.joinCode;
    sessionStorage.richardCode = code;
  }
  renderState(state);
}

async function postJSON(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Richard-Code": code },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function setSubmitting(value) {
  isSubmitting = value;
  sendButton.disabled = value;
}

function setOffline(value) {
  offlineOverlay.classList.toggle("visible", value);
  content.disabled = value;
  sendButton.disabled = value || isSubmitting;
  settingsButton.disabled = value;
}

function scrollMessagesToEnd() {
  messages.scrollTop = messages.scrollHeight;
  requestAnimationFrame(() => {
    messages.scrollTop = messages.scrollHeight;
    requestAnimationFrame(() => {
      messages.scrollTop = messages.scrollHeight;
    });
  });
}

