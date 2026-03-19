#!/usr/bin/env node
/**
 * Claw Dots — Database Operations
 * 
 * Connects to Neon PostgreSQL and provides CRUD for signals.
 * Falls back to local db.json if Neon is unavailable.
 * 
 * Usage:
 *   node scripts/db.js --add '{"title":"...","player":"...","path":"...","type":"...","date":"...","detail":"..."}'
 *   node scripts/db.js --stats
 *   node scripts/db.js --export          # DB → data.json for website
 *   node scripts/db.js --export-api      # DB → api.json (full API endpoint)
 *   node scripts/db.js --list [--path X] [--type Y]
 *   node scripts/db.js --search "query"
 * 
 * Requires: NEON_CONNECTION_STRING env var or ~/.openclaw/secrets.json
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data.json');
const API_PATH = path.join(__dirname, '..', 'api.json');

// ─── Get connection string ───────────────────────────────
function getConnectionString() {
  if (process.env.NEON_CONNECTION_STRING) return process.env.NEON_CONNECTION_STRING;
  try {
    const secrets = JSON.parse(fs.readFileSync(
      path.join(process.env.HOME, '.openclaw', 'secrets.json'), 'utf-8'
    ));
    return secrets.keys?.neon_connection_string;
  } catch { return null; }
}

// ─── Run SQL via psql (no native PG driver needed in Node) ──
function runSQL(sql, params = []) {
  const connStr = getConnectionString();
  if (!connStr) throw new Error('No NEON_CONNECTION_STRING found');
  
  // Escape params into SQL (simple approach for CLI tool)
  let query = sql;
  params.forEach((p, i) => {
    const escaped = p === null ? 'NULL' : 
      Array.isArray(p) ? `ARRAY[${p.map(v => `'${String(v).replace(/'/g, "''")}'`).join(',')}]` :
      typeof p === 'number' ? String(p) :
      `'${String(p).replace(/'/g, "''")}'`;
    query = query.replace(`$${i + 1}`, escaped);
  });
  
  const result = execSync(
    `psql "${connStr}" -t -A -F '|' -c "${query.replace(/"/g, '\\"')}"`,
    { encoding: 'utf-8', timeout: 10000 }
  ).trim();
  
  return result ? result.split('\n').map(row => row.split('|')) : [];
}

// ─── Add Signal ──────────────────────────────────────────
function addSignal(signal) {
  const required = ['title', 'player', 'path', 'type', 'date', 'detail'];
  for (const field of required) {
    if (!signal[field]) {
      console.error(`❌ Missing required field: ${field}`);
      process.exit(1);
    }
  }
  
  // Generate ID if missing
  if (!signal.id) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const slug = signal.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    signal.id = `sig-${date}-${slug}`;
  }
  
  const validTypes = ['milestone', 'breakthrough', 'trend', 'failure', 'prediction'];
  if (!validTypes.includes(signal.type)) {
    console.error(`❌ Invalid type: ${signal.type}. Valid: ${validTypes.join(', ')}`);
    process.exit(1);
  }
  
  signal.confidence = signal.confidence || 'medium';
  signal.impact_score = signal.impact_score || 5;
  signal.tags = signal.tags || [];
  signal.connections = signal.connections || [];
  signal.discovered = signal.discovered || new Date().toISOString().slice(0, 10);
  
  const sql = `INSERT INTO signals (id, title, player, path, type, date, discovered, detail, funding, valuation, source_url, source_type, tags, connections, confidence, impact_score)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, detail=EXCLUDED.detail, updated_at=NOW()`;
  
  runSQL(sql, [
    signal.id, signal.title, signal.player, signal.path, signal.type,
    signal.date, signal.discovered, signal.detail,
    signal.funding || null, signal.valuation || null,
    signal.source_url || null, signal.source_type || null,
    signal.tags, signal.connections, signal.confidence, signal.impact_score
  ]);
  
  console.log(`✅ Added signal: ${signal.title}`);
  console.log(`   ID: ${signal.id}`);
  console.log(`   Path: ${signal.path} | Type: ${signal.type} | Impact: ${signal.impact_score}/10`);
}

// ─── Export DB → data.json ───────────────────────────────
function exportData() {
  // Get paths
  const pathRows = runSQL("SELECT id, label, icon, color, description FROM paths ORDER BY id");
  const paths = {};
  pathRows.forEach(r => {
    paths[r[0]] = { id: r[0], label: r[1], icon: r[2], color: r[3], description: r[4] || '' };
  });
  
  // Get signals ordered by date
  const sigRows = runSQL(`
    SELECT id, title, player, path, type, date, detail, funding, source_url, impact_score, connections, tags
    FROM signals ORDER BY date ASC, impact_score DESC
  `);
  
  // Group by path
  const pathData = {};
  for (const pid of Object.keys(paths)) {
    pathData[pid] = { ...paths[pid], pieces: [] };
  }
  
  let totalFunding = 0;
  sigRows.forEach(r => {
    const [id, title, player, p, type, date, detail, funding, source_url, impact, conns, tags] = r;
    if (!pathData[p]) return;
    pathData[p].pieces.push({
      id, label: title.length > 60 ? title.slice(0, 57) + '...' : title,
      player, date, type, detail,
      funding: funding && funding !== '' ? funding : undefined,
      source_url: source_url && source_url !== '' ? source_url : undefined,
      impact_score: parseInt(impact) || 5,
      connections: conns && conns !== '{}' ? conns.replace(/[{}]/g, '').split(',').filter(Boolean) : []
    });
    
    if (funding) {
      const match = funding.match(/\$([\d.]+)([BMK])/i);
      if (match) {
        const num = parseFloat(match[1]);
        const unit = match[2].toUpperCase();
        totalFunding += unit === 'B' ? num * 1000 : unit === 'M' ? num : num / 1000;
      }
    }
  });
  
  // Get research queries
  const rqRows = runSQL("SELECT query, frequency, sources FROM research_queries WHERE enabled = true ORDER BY id");
  const researchQueries = rqRows.map(r => ({
    query: r[0], frequency: r[1],
    sources: r[2] ? r[2].replace(/[{}]/g, '').split(',').filter(Boolean) : []
  }));
  
  const data = {
    meta: {
      title: "Claw Dots",
      subtitle: "Tracking the convergence toward Agentic OS",
      lastUpdated: new Date().toISOString().slice(0, 10),
      version: "2.0",
      totalSignals: sigRows.length,
      totalFundingTrackedM: Math.round(totalFunding),
      source: "neon-postgresql"
    },
    paths: Object.values(pathData).filter(p => p.pieces.length > 0),
    convergenceNode: {
      id: "agentic-os-convergence",
      label: "Agentic OS",
      detail: "All paths converge: Foundation Models + Computer Use + Frameworks + Protocols + Platforms + Devices = The Agent Operating System",
      prediction: "By 2027, your OS IS an agent. Not an app you open — the entire interface.",
      marketSize: "$12-15B in 2026 → $52B by 2030"
    },
    researchQueries
  };
  
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n');
  console.log(`✅ Exported ${sigRows.length} signals → data.json`);
  console.log(`   Paths: ${data.paths.map(p => `${p.icon} ${p.label} (${p.pieces.length})`).join(', ')}`);
  console.log(`   Funding tracked: $${totalFunding.toFixed(0)}M`);
}

// ─── Export API JSON ─────────────────────────────────────
function exportAPI() {
  const sigRows = runSQL(`
    SELECT id, title, player, path, type, date, discovered, detail, funding, valuation, 
           source_url, source_type, tags, connections, confidence, impact_score
    FROM signals ORDER BY date DESC, impact_score DESC
  `);
  
  const signals = sigRows.map(r => ({
    id: r[0], title: r[1], player: r[2], path: r[3], type: r[4],
    date: r[5], discovered: r[6], detail: r[7],
    funding: r[8] || undefined, valuation: r[9] || undefined,
    source_url: r[10] || undefined, source_type: r[11] || undefined,
    tags: r[12] ? r[12].replace(/[{}]/g, '').split(',').filter(Boolean) : [],
    connections: r[13] ? r[13].replace(/[{}]/g, '').split(',').filter(Boolean) : [],
    confidence: r[14], impact_score: parseInt(r[15]) || 5
  }));
  
  fs.writeFileSync(API_PATH, JSON.stringify({ signals, count: signals.length, updated: new Date().toISOString() }, null, 2) + '\n');
  console.log(`✅ Exported ${signals.length} signals → api.json`);
}

// ─── Stats ───────────────────────────────────────────────
function showStats() {
  console.log('\n🧩 Claw Dots Database Stats (Neon PostgreSQL)');
  console.log('─'.repeat(45));
  
  const total = runSQL("SELECT COUNT(*) FROM signals");
  console.log(`Total signals: ${total[0][0]}`);
  
  console.log('\nBy Path:');
  const byPath = runSQL("SELECT p.icon, p.label, COUNT(s.id) FROM paths p LEFT JOIN signals s ON s.path = p.id GROUP BY p.id, p.icon, p.label ORDER BY COUNT(s.id) DESC");
  byPath.forEach(r => console.log(`  ${r[0]} ${r[1]}: ${r[2]}`));
  
  console.log('\nBy Type:');
  const byType = runSQL("SELECT type, COUNT(*) FROM signals GROUP BY type ORDER BY COUNT(*) DESC");
  byType.forEach(r => console.log(`  ${r[0]}: ${r[1]}`));
  
  console.log('\nTop 5 by Impact:');
  const top = runSQL("SELECT impact_score, title FROM signals ORDER BY impact_score DESC LIMIT 5");
  top.forEach(r => console.log(`  [${r[0]}/10] ${r[1]}`));
  
  console.log('');
}

// ─── Search ──────────────────────────────────────────────
function searchSignals(query) {
  const rows = runSQL(`
    SELECT id, title, player, path, type, impact_score 
    FROM signals 
    WHERE title ILIKE $1 OR detail ILIKE $1 OR player ILIKE $1 OR tags::text ILIKE $1
    ORDER BY impact_score DESC
  `, [`%${query}%`]);
  
  if (rows.length === 0) {
    console.log(`No signals found matching "${query}"`);
    return;
  }
  console.log(`Found ${rows.length} signals matching "${query}":\n`);
  rows.forEach(r => console.log(`  [${r[5]}/10] ${r[1]} (${r[2]}) — ${r[3]}/${r[4]}`));
}

// ─── List ────────────────────────────────────────────────
function listSignals(filters) {
  let where = [];
  let params = [];
  let i = 1;
  
  if (filters.path) { where.push(`path = $${i}`); params.push(filters.path); i++; }
  if (filters.type) { where.push(`type = $${i}`); params.push(filters.type); i++; }
  
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = runSQL(`SELECT id, title, player, path, type, date, impact_score FROM signals ${whereClause} ORDER BY date DESC`, params);
  
  console.log(`${rows.length} signals:\n`);
  rows.forEach(r => console.log(`  [${r[6]}/10] ${r[5]} | ${r[1]} (${r[2]}) — ${r[3]}/${r[4]}`));
}

// ─── CLI ─────────────────────────────────────────────────
const args = process.argv.slice(2);

try {
  if (args.includes('--stats')) {
    showStats();
  } else if (args.includes('--export')) {
    exportData();
  } else if (args.includes('--export-api')) {
    exportAPI();
  } else if (args.includes('--add')) {
    const jsonStr = args[args.indexOf('--add') + 1];
    if (!jsonStr) { console.log('Usage: node db.js --add \'{"title":"..."}\''); process.exit(0); }
    addSignal(JSON.parse(jsonStr));
  } else if (args.includes('--search')) {
    searchSignals(args[args.indexOf('--search') + 1] || '');
  } else if (args.includes('--list')) {
    const pathIdx = args.indexOf('--path');
    const typeIdx = args.indexOf('--type');
    listSignals({
      path: pathIdx > -1 ? args[pathIdx + 1] : null,
      type: typeIdx > -1 ? args[typeIdx + 1] : null
    });
  } else {
    console.log(`
🧩 Claw Dots — Database CLI (Neon PostgreSQL)

  node db.js --stats               Database stats
  node db.js --add '{...}'         Add signal
  node db.js --export              Export → data.json (website)
  node db.js --export-api          Export → api.json (full API)
  node db.js --list [--path X]     List signals
  node db.js --search "query"      Search signals
`);
  }
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
