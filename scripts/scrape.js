#!/usr/bin/env node
/**
 * Claw Dots — Research Scraper
 * 
 * Scans for new signals using predefined research queries,
 * extracts structured data, and appends to db.json.
 * 
 * Usage:
 *   node scripts/scrape.js                    # Run all queries
 *   node scripts/scrape.js --query "search"   # Custom one-off query
 *   node scripts/scrape.js --add-signal       # Interactive: add signal from stdin JSON
 *   node scripts/scrape.js --export           # Export db.json → data.json for website
 *   node scripts/scrape.js --stats            # Print database stats
 * 
 * Environment:
 *   Designed to run inside OpenClaw agent context (uses web_search via agent).
 *   Can also be called by cron jobs or pipelines.
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'db.json');
const DATA_PATH = path.join(__dirname, '..', 'data.json');

// ─── Load DB ──────────────────────────────────────────────
function loadDb() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + '\n');
}

// ─── Add Signal ───────────────────────────────────────────
function addSignal(signal) {
  const db = loadDb();
  
  // Validate required fields
  const required = ['id', 'title', 'player', 'path', 'type', 'date', 'detail'];
  for (const field of required) {
    if (!signal[field]) {
      console.error(`❌ Missing required field: ${field}`);
      console.error(`Required: ${required.join(', ')}`);
      process.exit(1);
    }
  }
  
  // Check for duplicate
  if (db.signals.find(s => s.id === signal.id)) {
    console.error(`⚠️ Signal already exists: ${signal.id}`);
    process.exit(1);
  }
  
  // Validate path
  if (!db.paths[signal.path]) {
    console.error(`❌ Unknown path: ${signal.path}`);
    console.error(`Valid paths: ${Object.keys(db.paths).join(', ')}`);
    process.exit(1);
  }
  
  // Validate type
  const validTypes = ['milestone', 'breakthrough', 'trend', 'failure', 'prediction'];
  if (!validTypes.includes(signal.type)) {
    console.error(`❌ Unknown type: ${signal.type}`);
    console.error(`Valid types: ${validTypes.join(', ')}`);
    process.exit(1);
  }
  
  // Set defaults
  signal.discovered = signal.discovered || new Date().toISOString().slice(0, 10);
  signal.confidence = signal.confidence || 'medium';
  signal.impact_score = signal.impact_score || 5;
  signal.tags = signal.tags || [];
  signal.connections = signal.connections || [];
  
  db.signals.push(signal);
  saveDb(db);
  console.log(`✅ Added signal: ${signal.title} (${signal.id})`);
  console.log(`   Path: ${db.paths[signal.path].icon} ${db.paths[signal.path].label}`);
  console.log(`   Type: ${signal.type} | Impact: ${signal.impact_score}/10`);
  return signal;
}

// ─── Export: db.json → data.json ──────────────────────────
function exportToDataJson() {
  const db = loadDb();
  
  // Group signals by path, sort by date
  const pathGroups = {};
  for (const [pathId, pathMeta] of Object.entries(db.paths)) {
    pathGroups[pathId] = {
      id: pathId,
      label: pathMeta.label,
      color: pathMeta.color,
      icon: pathMeta.icon,
      description: getPathDescription(pathId),
      pieces: []
    };
  }
  
  // Sort signals by date and assign to paths
  const sorted = [...db.signals].sort((a, b) => {
    const da = a.date.replace(/[^\d-]/g, '').slice(0, 7);
    const db2 = b.date.replace(/[^\d-]/g, '').slice(0, 7);
    return da.localeCompare(db2);
  });
  
  for (const sig of sorted) {
    if (!pathGroups[sig.path]) continue;
    pathGroups[sig.path].pieces.push({
      id: sig.id,
      label: sig.title.length > 50 ? sig.title.slice(0, 47) + '...' : sig.title,
      player: sig.player,
      date: sig.date,
      type: sig.type,
      detail: sig.detail,
      funding: sig.funding || undefined,
      source_url: sig.source_url || undefined,
      impact_score: sig.impact_score,
      connections: sig.connections
    });
  }
  
  // Calculate market stats
  const totalFunding = db.signals
    .filter(s => s.funding)
    .map(s => {
      const match = s.funding.match(/\$([\d.]+)([BMK])/i);
      if (!match) return 0;
      const num = parseFloat(match[1]);
      const unit = match[2].toUpperCase();
      return unit === 'B' ? num * 1000 : unit === 'M' ? num : num / 1000;
    })
    .reduce((sum, v) => sum + v, 0);
  
  const data = {
    meta: {
      title: "Claw Dots",
      subtitle: "Tracking the convergence toward Agentic OS",
      lastUpdated: new Date().toISOString().slice(0, 10),
      version: "2.0",
      totalSignals: db.signals.length,
      totalFundingTrackedM: Math.round(totalFunding)
    },
    paths: Object.values(pathGroups).filter(p => p.pieces.length > 0),
    convergenceNode: {
      id: "agentic-os-convergence",
      label: "Agentic OS",
      detail: "All paths converge: Foundation Models + Computer Use + Frameworks + Protocols + Platforms + Devices = The Agent Operating System",
      prediction: "By 2027, your OS IS an agent. Not an app you open — the entire interface.",
      marketSize: "$12-15B in 2026 → $52B by 2030"
    },
    researchQueries: db.research_queries
  };
  
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n');
  console.log(`✅ Exported ${db.signals.length} signals → data.json`);
  console.log(`   Paths: ${data.paths.map(p => `${p.icon} ${p.label} (${p.pieces.length})`).join(', ')}`);
  console.log(`   Total funding tracked: $${totalFunding.toFixed(0)}M`);
  return data;
}

// ─── Stats ────────────────────────────────────────────────
function printStats() {
  const db = loadDb();
  console.log(`\n🧩 Claw Dots Database Stats`);
  console.log(`${'─'.repeat(40)}`);
  console.log(`Total signals: ${db.signals.length}`);
  console.log(`Schema version: ${db.schema_version}`);
  console.log('');
  
  // By path
  console.log('By Path:');
  for (const [pathId, meta] of Object.entries(db.paths)) {
    const count = db.signals.filter(s => s.path === pathId).length;
    console.log(`  ${meta.icon} ${meta.label}: ${count} signals`);
  }
  
  // By type
  console.log('\nBy Type:');
  const types = ['milestone', 'breakthrough', 'trend', 'failure', 'prediction'];
  for (const t of types) {
    const count = db.signals.filter(s => s.type === t).length;
    console.log(`  ${t}: ${count}`);
  }
  
  // By confidence
  console.log('\nBy Confidence:');
  for (const c of ['high', 'medium', 'low']) {
    const count = db.signals.filter(s => s.confidence === c).length;
    if (count) console.log(`  ${c}: ${count}`);
  }
  
  // Top impact
  console.log('\nTop 5 by Impact:');
  const top = [...db.signals].sort((a, b) => (b.impact_score || 0) - (a.impact_score || 0)).slice(0, 5);
  for (const s of top) {
    console.log(`  [${s.impact_score}/10] ${s.title}`);
  }
  
  // Research queries
  console.log(`\nResearch queries: ${db.research_queries.length}`);
  console.log('');
}

// ─── Generate Signal ID ──────────────────────────────────
function generateId(title) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
  return `sig-${date}-${slug}`;
}

// ─── Path Descriptions ───────────────────────────────────
function getPathDescription(pathId) {
  const descs = {
    'foundation-models': 'The brains — LLMs that power everything',
    'computer-use': 'AI that can see and control screens like humans',
    'agent-frameworks': 'The plumbing that connects models to actions',
    'agent-protocols': 'How agents talk to each other and to tools',
    'agentic-os-platforms': 'Full operating systems for AI agents — the endgame',
    'wearables-devices': 'Physical devices that bring agents into the real world'
  };
  return descs[pathId] || '';
}

// ─── CLI ──────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes('--stats')) {
  printStats();
} else if (args.includes('--export')) {
  exportToDataJson();
} else if (args.includes('--add-signal')) {
  // Read JSON from stdin or next arg
  const jsonIdx = args.indexOf('--add-signal');
  const jsonStr = args[jsonIdx + 1];
  if (!jsonStr) {
    console.log('Usage: node scrape.js --add-signal \'{"title":"...","player":"...","path":"...","type":"...","date":"...","detail":"..."}\'');
    console.log('\nRequired fields: id (auto-generated if missing), title, player, path, type, date, detail');
    console.log(`Valid paths: ${Object.keys(loadDb().paths).join(', ')}`);
    console.log('Valid types: milestone, breakthrough, trend, failure, prediction');
    console.log('\nOptional: funding, valuation, source_url, source_type, tags[], connections[], confidence, impact_score');
    process.exit(0);
  }
  const signal = JSON.parse(jsonStr);
  if (!signal.id) signal.id = generateId(signal.title);
  addSignal(signal);
} else if (args.includes('--query')) {
  console.log('📡 Query mode — designed to be called by OpenClaw agent');
  console.log('The agent runs web_search with research_queries from db.json,');
  console.log('then calls --add-signal for each new finding.');
  console.log('\nResearch queries:');
  const db = loadDb();
  db.research_queries.forEach(q => {
    console.log(`  [${q.frequency}] "${q.query}"`);
    console.log(`    Sources: ${q.sources.join(', ')}`);
  });
} else {
  console.log(`
🧩 Claw Dots — Research Pipeline

Usage:
  node scrape.js --stats              Show database stats
  node scrape.js --export             Export db.json → data.json for website
  node scrape.js --add-signal '{}'    Add a new signal (JSON)
  node scrape.js --query              Show research queries for agent

Pipeline flow:
  1. Agent runs web_search with research queries
  2. Agent extracts structured signals
  3. Agent calls: node scrape.js --add-signal '{...}'
  4. Agent calls: node scrape.js --export
  5. Agent commits and pushes → site auto-updates

Signal Schema:
  {
    "title": "What happened",
    "player": "Who did it",
    "path": "which convergence path",
    "type": "milestone|breakthrough|trend|failure|prediction",
    "date": "2026-03",
    "detail": "Why it matters for Agentic OS convergence",
    "funding": "$XM (optional)",
    "source_url": "https://...",
    "tags": ["tag1", "tag2"],
    "impact_score": 1-10
  }
`);
}
