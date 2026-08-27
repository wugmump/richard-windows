# Richard Windows

Richard Windows is a browser-controlled version of Richard for Windows 11 and other machines that can run Node.js. There is no native desktop UI. The local machine runs a small HTTP server, and every control is exposed through the browser.

This is a fresh web-server port of the macOS Richard project, not a SwiftUI app. It keeps the important runtime ideas: one shared multi-user conversation, a required name prompt, a join code, local-network sharing, browser settings, an Asshole Level slider, and an Ollama-compatible local model backend.

## Requirements

- Windows 11.
- Node.js 20 or newer.
- Ollama installed and running.
- The Richard chat model pulled into Ollama.

Install Ollama from:

```txt
https://ollama.com/download
```

Pull the default model:

```powershell
ollama pull hf.co/TheDrummer/Cydonia-24B-v4.3-GGUF:Q4_K_M
```

## Run

From this repo:

```powershell
npm start
```

Then open:

```txt
http://localhost:9443
```

Other office users can open:

```txt
http://WINDOWS-PC-IP:9443
```

The default join code is:

```txt
696367
```

## Browser Controls

The whole app is controlled in the browser:

- The first prompt asks for a name and stores it in browser local storage.
- The shared conversation is shown to every joined browser client.
- The gear button opens settings.
- Settings include backend URL, model name, join code, Asshole Level, context size, max tokens, and temperature.
- The reset button clears the shared transcript.

## Environment Variables

These values can override first-run defaults:

```powershell
$env:HOST="0.0.0.0"
$env:PORT="9443"
$env:RICHARD_JOIN_CODE="696367"
$env:OLLAMA_URL="http://127.0.0.1:11434"
$env:RICHARD_MODEL="hf.co/TheDrummer/Cydonia-24B-v4.3-GGUF:Q4_K_M"
npm start
```

Settings edited in the browser are saved to:

```txt
data/config.json
```

The transcript is saved to:

```txt
data/transcript.json
```

Both files are ignored by git.

## API

All API calls require the join code in `X-Richard-Code`, `?code=`, or the JSON body.

```txt
GET  /api/state?code=JOIN_CODE
POST /api/messages
POST /api/settings
POST /api/reset
```

Post a message:

```powershell
curl -Method POST http://localhost:9443/api/messages `
  -Headers @{"Content-Type"="application/json"; "X-Richard-Code"="696367"} `
  -Body '{"author":"Josh","content":"What date is it?","code":"696367"}'
```

## Current Scope

Implemented:

- Browser-only shared chat runtime.
- Local-network HTTP server.
- Persistent settings and transcript.
- Ollama `/api/chat` integration.
- Browser settings dialog.
- Full-screen offline overlay for already-open clients.
- Duplicate-submit protection.
- Fresh app-clock prompt injection on every model request.

Not yet ported:

- Native macOS UI.
- Raspberry Pi control.
- Image paste and local vision model integration.
- Codex bridge.
- HTTPS certificates.

Those should be added as browser/server features rather than native desktop features.

