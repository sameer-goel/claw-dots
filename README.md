# 🧩 Claw Dots

**Puzzle-piece intelligence map tracking the convergence toward Agentic OS.**

Every dot is a signal. Every piece connects to the next. Six parallel paths — all converging to one destination.

## 🔴 Live Site

👉 **[sameer-goel.github.io/claw-dots](https://sameer-goel.github.io/claw-dots/)**

## What Is This?

Claw Dots is an interactive visualization that tracks the major technology paths converging toward the **Agentic Operating System** — the inevitable future where your OS *is* an AI agent.

### 🧩 Six Convergence Paths

| Path | What It Tracks |
|------|---------------|
| 🧠 Foundation Models | GPT-4 → Claude Opus 4.6 → Open-weight wave |
| 🖥️ Computer Use | Claude Computer Use → Rabbit R1 → Cowork |
| ⚙️ Agent Frameworks | AutoGPT → LangChain → OpenClaw → NemoClaw |
| 🔗 Agent Protocols | Function Calling → MCP → A2A → Protocol wars |
| 🏗️ Agentic OS Platforms | Sierra → Slack → ZyG → Lyzr → Airrived |
| ⌚ AI Wearables | Humane ☠️ → Rabbit → Limitless → Omi → Ray-Bans |

### Features

- **Sequential puzzle pieces** — each event connects to the next chronologically
- **Parallel paths view** — SVG diagram showing all tracks converging to one point
- **Click any piece** for full details, funding data, and context
- **Color-coded types** — Milestone, Breakthrough, Trend, Failure, Prediction
- **Data-driven** — everything loaded from `data.json` (easy to update)

## 💰 Market Data

- AI Agent Market: **$12-15B** (2026) → **$52B** by 2030
- Tracked funding: Sierra ($350M), ZyG ($58M), Lyzr ($8M), Airrived ($6.1M), Maestro ($1.2M)

## 🛠️ Tech

Pure HTML + CSS + vanilla JS. No frameworks. No build step. Dark theme with Inter font.

Data source: `data.json` — add new pieces there and the UI auto-renders.

## Contributing

Add a piece to `data.json` following the schema:

```json
{
  "id": "unique-id",
  "label": "Event Name",
  "player": "Company",
  "date": "2026-03",
  "type": "milestone|breakthrough|trend|failure|prediction",
  "detail": "Why this matters",
  "funding": "$X (optional)"
}
```

---

Built by [Sameer Goel](https://github.com/sameer-goel) & Scout 🔭
