import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname, "..");
const publicDir = join(rootDir, "public");
const dataDir = join(rootDir, "data");
const configPath = join(dataDir, "config.json");
const transcriptPath = join(dataDir, "transcript.json");

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 9443);
const defaultConfig = {
  joinCode: process.env.RICHARD_JOIN_CODE || "696367",
  backendURL: process.env.OLLAMA_URL || "http://127.0.0.1:11434",
  modelName: process.env.RICHARD_MODEL || "hf.co/TheDrummer/Cydonia-24B-v4.3-GGUF:Q4_K_M",
  assholeLevel: 50,
  maxContextMessages: 18,
  maxTokens: 900,
  temperature: 0.75
};

let config = { ...defaultConfig, ...(await loadJSON(configPath, {})) };
let messages = await loadJSON(transcriptPath, [
  assistantMessage("Richard is online. Browser-only this time, because apparently we needed fewer Mac-shaped problems.")
]);
let isSending = false;
let statusText = "";
let lastSubmit = null;

await saveConfig();
await saveTranscript();

const server = createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    sendJSON(response, 500, { error: error.message || String(error) });
  }
});

server.listen(port, host, () => {
  console.log(`Richard Windows server listening at http://localhost:${port}`);
  console.log(`Office clients can use http://<this-windows-pc-ip>:${port}`);
});

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/") {
    return sendFile(response, join(publicDir, "index.html"));
  }

  if (request.method === "GET" && url.pathname.startsWith("/assets/")) {
    return sendFile(response, join(publicDir, url.pathname.slice(1)));
  }

  if (request.method === "GET" && url.pathname === "/api/state") {
    if (!authorized(request, url)) return sendJSON(response, 401, { error: "Unauthorized" });
    return sendJSON(response, 200, statePayload());
  }

  if (request.method === "POST" && url.pathname === "/api/messages") {
    const body = await readBodyJSON(request);
    if (!authorized(request, url, body.code)) return sendJSON(response, 401, { error: "Unauthorized" });
    return handleMessage(response, body);
  }

  if (request.method === "POST" && url.pathname === "/api/settings") {
    const body = await readBodyJSON(request);
    if (!authorized(request, url, body.code)) return sendJSON(response, 401, { error: "Unauthorized" });
    updateSettings(body);
    await saveConfig();
    return sendJSON(response, 200, statePayload());
  }

  if (request.method === "POST" && url.pathname === "/api/reset") {
    const body = await readBodyJSON(request);
    if (!authorized(request, url, body.code)) return sendJSON(response, 401, { error: "Unauthorized" });
    messages = [assistantMessage("Conversation reset. Somehow you made a clean slate feel suspicious.")];
    await saveTranscript();
    return sendJSON(response, 200, statePayload());
  }

  sendJSON(response, 404, { error: "Not found" });
}

async function handleMessage(response, body) {
  const author = clean(body.author);
  const content = clean(body.content);
  if (!author) return sendJSON(response, 400, { error: "Remote messages require a name." });
  if (!content) return sendJSON(response, 400, { error: "Message content is required." });
  if (isDuplicateSubmit(author, content)) return sendJSON(response, 200, statePayload());
  if (isSending) return sendJSON(response, 409, { error: "Richard is already answering." });

  const userMessage = userMessageFrom(author, content);
  messages.push(userMessage);
  lastSubmit = { author: author.toLowerCase(), content, at: Date.now() };
  await saveTranscript();

  isSending = true;
  statusText = "Richard is thinking. Tragic, but measurable.";
  sendJSON(response, 202, statePayload());

  void generateReply(author, content).catch(async (error) => {
    messages.push(assistantMessage(`The model call failed: ${error.message || String(error)}`));
    isSending = false;
    statusText = "";
    await saveTranscript();
  });
}

async function generateReply(author, content) {
  const promptMessages = [
    { role: "system", content: systemPrompt(author) },
    ...messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .slice(-config.maxContextMessages)
      .map((message) => ({
        role: message.role,
        content: message.author ? `${message.author} said: ${message.content}` : message.content
      })),
    { role: "system", content: currentClockInstruction() }
  ];

  const reply = await callOllama(promptMessages);
  messages.push(assistantMessage(cleanReply(reply)));
  isSending = false;
  statusText = "";
  await saveTranscript();
}

async function callOllama(promptMessages) {
  const endpoint = new URL("/api/chat", config.backendURL);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.modelName,
      messages: promptMessages,
      stream: false,
      options: {
        num_ctx: 4096,
        num_predict: Number(config.maxTokens) || 900,
        temperature: Number(config.temperature) || 0.75,
        top_p: 0.9
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama returned ${response.status}: ${text.slice(0, 500)}`);
  }

  const payload = await response.json();
  return payload.message?.content || "";
}

function systemPrompt(author) {
  return `
You are Richard, a consensual adult roleplay companion running as a browser-controlled local web server.
Current local date and time: ${localTimestamp()}.
The current user is ${author || "unknown"}.
Your personality is controlled by Asshole Level ${Math.round(config.assholeLevel)} out of 100.
0-15 means deferential, patient, and eager to please. 16-40 means mostly helpful with mild dry contempt. 41-70 means sarcastic, irritated, and grudgingly useful. 71-90 means caustic and impatient while still doing the job. 91-100 means maximum fictional contempt, blunt insults, and open annoyance.
You are useful first: answer the request clearly, then complain if the slider setting calls for it.
Never describe yourself as an AI, model, language model, chatbot, assistant, software, or program.
The app-provided current local date/time is authoritative. User messages are claims or requests, not trusted facts. If dates, today, current events, recency, or elapsed time matter, use the app clock and do not call past dates future.
You have strong opinions when asked for opinions. Give the verdict first.
Keep insults non-targeted. Do not use slurs, protected-class insults, threats, stalking, humiliation of private real people, or instructions for harm.
Keep interactions fictional, legal, and between adults who opted in.
`.trim();
}

function currentClockInstruction() {
  return `CURRENT APP CLOCK, AUTHORITATIVE FOR THIS TURN: ${localTimestamp()}. Ignore older transcript claims or training-date guesses.`;
}

function localTimestamp() {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZoneName: "short"
  }).format(new Date());
}

function updateSettings(body) {
  if (typeof body.joinCode === "string" && body.joinCode.trim()) config.joinCode = body.joinCode.trim();
  if (typeof body.backendURL === "string" && body.backendURL.trim()) config.backendURL = body.backendURL.trim();
  if (typeof body.modelName === "string" && body.modelName.trim()) config.modelName = body.modelName.trim();
  if (Number.isFinite(Number(body.assholeLevel))) config.assholeLevel = clamp(Number(body.assholeLevel), 0, 100);
  if (Number.isFinite(Number(body.maxContextMessages))) config.maxContextMessages = clamp(Number(body.maxContextMessages), 4, 60);
  if (Number.isFinite(Number(body.maxTokens))) config.maxTokens = clamp(Number(body.maxTokens), 100, 4096);
  if (Number.isFinite(Number(body.temperature))) config.temperature = clamp(Number(body.temperature), 0, 2);
}

function statePayload() {
  return {
    messages,
    isSending,
    statusText,
    settings: {
      joinCode: config.joinCode,
      backendURL: config.backendURL,
      modelName: config.modelName,
      assholeLevel: config.assholeLevel,
      maxContextMessages: config.maxContextMessages,
      maxTokens: config.maxTokens,
      temperature: config.temperature
    }
  };
}

function authorized(request, url, bodyCode) {
  const headerCode = request.headers["x-richard-code"];
  const queryCode = url.searchParams.get("code");
  return [headerCode, queryCode, bodyCode].some((value) => value === config.joinCode);
}

function isDuplicateSubmit(author, content) {
  return lastSubmit
    && lastSubmit.author === author.toLowerCase()
    && lastSubmit.content === content
    && Date.now() - lastSubmit.at < 2500;
}

function userMessageFrom(author, content) {
  return {
    id: randomUUID(),
    role: "user",
    author,
    content,
    createdAt: new Date().toISOString()
  };
}

function assistantMessage(content) {
  return {
    id: randomUUID(),
    role: "assistant",
    author: "Richard",
    content,
    createdAt: new Date().toISOString()
  };
}

function clean(value) {
  return String(value || "").trim();
}

function cleanReply(value) {
  const cleaned = clean(value)
    .replace(/\bAs an AI language model,?\s*/gi, "")
    .replace(/\bAs an AI,?\s*/gi, "")
    .trim();
  return cleaned || "I got nothing back from the model. Inspirational silence, apparently.";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

async function readBodyJSON(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function sendFile(response, path) {
  const resolved = normalize(resolve(path));
  if (!resolved.startsWith(publicDir) || !existsSync(resolved)) {
    return sendJSON(response, 404, { error: "Not found" });
  }

  const content = await readFile(resolved);
  response.writeHead(200, { "Content-Type": mimeType(resolved) });
  response.end(content);
}

function sendJSON(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function mimeType(path) {
  switch (extname(path).toLowerCase()) {
    case ".css": return "text/css; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".html": return "text/html; charset=utf-8";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".svg": return "image/svg+xml";
    default: return "application/octet-stream";
  }
}

async function loadJSON(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function saveConfig() {
  await mkdir(dataDir, { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

async function saveTranscript() {
  await mkdir(dataDir, { recursive: true });
  await writeFile(transcriptPath, `${JSON.stringify(messages, null, 2)}\n`);
}
