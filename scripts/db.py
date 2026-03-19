#!/usr/bin/env python3
"""
Claw Dots — Database CLI (Neon PostgreSQL)

Usage:
  python3 scripts/db.py --stats
  python3 scripts/db.py --add '{"title":"...","player":"...","path":"...","type":"...","date":"...","detail":"..."}'
  python3 scripts/db.py --export          # DB → data.json for website
  python3 scripts/db.py --export-api      # DB → api.json (full data)
  python3 scripts/db.py --list [--path X] [--type Y]
  python3 scripts/db.py --search "query"
"""

import sys, json, os
from datetime import datetime, date
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
ROOT_DIR = SCRIPT_DIR.parent
DATA_PATH = ROOT_DIR / "data.json"
API_PATH = ROOT_DIR / "api.json"

def get_conn():
    import psycopg2
    secrets_path = Path.home() / ".openclaw" / "secrets.json"
    conn_str = os.environ.get("NEON_CONNECTION_STRING")
    if not conn_str and secrets_path.exists():
        with open(secrets_path) as f:
            secrets = json.load(f)
        conn_str = secrets.get("keys", {}).get("neon_connection_string")
    if not conn_str:
        print("❌ No NEON_CONNECTION_STRING found")
        sys.exit(1)
    return psycopg2.connect(conn_str)


def add_signal(signal):
    required = ['title', 'player', 'path', 'type', 'date', 'detail']
    for f in required:
        if f not in signal or not signal[f]:
            print(f"❌ Missing required field: {f}")
            sys.exit(1)

    valid_types = ['milestone', 'breakthrough', 'trend', 'failure', 'prediction']
    if signal['type'] not in valid_types:
        print(f"❌ Invalid type: {signal['type']}. Valid: {', '.join(valid_types)}")
        sys.exit(1)

    if 'id' not in signal or not signal['id']:
        d = datetime.now().strftime('%Y%m%d')
        slug = ''.join(c if c.isalnum() else '-' for c in signal['title'].lower())[:40]
        signal['id'] = f"sig-{d}-{slug}"

    signal.setdefault('confidence', 'medium')
    signal.setdefault('impact_score', 5)
    signal.setdefault('tags', [])
    signal.setdefault('connections', [])
    signal.setdefault('discovered', date.today().isoformat())

    conn = get_conn()
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO signals (id, title, player, path, type, date, discovered, detail, 
                           funding, valuation, source_url, source_type, tags, connections, confidence, impact_score)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, detail=EXCLUDED.detail, updated_at=NOW()
    """, (
        signal['id'], signal['title'], signal['player'], signal['path'], signal['type'],
        signal['date'], signal['discovered'], signal['detail'],
        signal.get('funding'), signal.get('valuation'),
        signal.get('source_url'), signal.get('source_type'),
        signal['tags'], signal['connections'], signal['confidence'], signal['impact_score']
    ))
    cur.close(); conn.close()
    print(f"✅ Added: {signal['title']}")
    print(f"   ID: {signal['id']} | Path: {signal['path']} | Type: {signal['type']} | Impact: {signal['impact_score']}/10")


def export_data():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("SELECT id, label, icon, color, description FROM paths ORDER BY id")
    paths = {r[0]: {"id": r[0], "label": r[1], "icon": r[2], "color": r[3], "description": r[4] or "", "pieces": []} for r in cur.fetchall()}

    cur.execute("SELECT id,title,player,path,type,date,detail,funding,source_url,impact_score,connections,tags FROM signals ORDER BY date ASC, impact_score DESC")
    total_funding = 0
    for r in cur.fetchall():
        sid, title, player, p, stype, sdate, detail, funding, source_url, impact, conns, tags = r
        if p not in paths:
            continue
        piece = {
            "id": sid,
            "label": title[:57] + "..." if len(title) > 60 else title,
            "player": player, "date": sdate, "type": stype, "detail": detail,
            "impact_score": impact or 5,
            "connections": conns or []
        }
        if funding: piece["funding"] = funding
        if source_url: piece["source_url"] = source_url
        paths[p]["pieces"].append(piece)

        if funding:
            import re
            m = re.search(r'\$([\d.]+)([BMK])', funding, re.I)
            if m:
                num = float(m.group(1))
                unit = m.group(2).upper()
                total_funding += num * 1000 if unit == 'B' else num if unit == 'M' else num / 1000

    cur.execute("SELECT query, frequency, sources FROM research_queries WHERE enabled = true ORDER BY id")
    research_queries = [{"query": r[0], "frequency": r[1], "sources": r[2] or []} for r in cur.fetchall()]

    sig_count = sum(len(p["pieces"]) for p in paths.values())

    data = {
        "meta": {
            "title": "Claw Dots",
            "subtitle": "Tracking the convergence toward Agentic OS",
            "lastUpdated": date.today().isoformat(),
            "version": "2.0",
            "totalSignals": sig_count,
            "totalFundingTrackedM": round(total_funding),
            "source": "neon-postgresql"
        },
        "paths": [p for p in paths.values() if p["pieces"]],
        "convergenceNode": {
            "id": "agentic-os-convergence",
            "label": "Agentic OS",
            "detail": "All paths converge: Foundation Models + Computer Use + Frameworks + Protocols + Platforms + Devices = The Agent Operating System",
            "prediction": "By 2027, your OS IS an agent. Not an app you open — the entire interface.",
            "marketSize": "$12-15B in 2026 → $52B by 2030"
        },
        "researchQueries": research_queries
    }

    with open(DATA_PATH, 'w') as f:
        json.dump(data, f, indent=2)
    cur.close(); conn.close()
    print(f"✅ Exported {sig_count} signals → data.json")
    for p in data["paths"]:
        print(f"   {p['icon']} {p['label']}: {len(p['pieces'])} signals")
    print(f"   Funding tracked: ${total_funding:.0f}M")


def export_api():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""SELECT id,title,player,path,type,date,discovered,detail,funding,valuation,
                   source_url,source_type,tags,connections,confidence,impact_score 
                   FROM signals ORDER BY date DESC, impact_score DESC""")
    signals = []
    for r in cur.fetchall():
        s = {"id":r[0],"title":r[1],"player":r[2],"path":r[3],"type":r[4],"date":r[5],
             "discovered":str(r[6]) if r[6] else None,"detail":r[7],
             "tags":r[12] or [],"connections":r[13] or [],"confidence":r[14],"impact_score":r[15]}
        if r[8]: s["funding"] = r[8]
        if r[9]: s["valuation"] = r[9]
        if r[10]: s["source_url"] = r[10]
        if r[11]: s["source_type"] = r[11]
        signals.append(s)
    with open(API_PATH, 'w') as f:
        json.dump({"signals": signals, "count": len(signals), "updated": datetime.now().isoformat()}, f, indent=2)
    cur.close(); conn.close()
    print(f"✅ Exported {len(signals)} signals → api.json")


def show_stats():
    conn = get_conn()
    cur = conn.cursor()
    print("\n🧩 Claw Dots Database Stats (Neon PostgreSQL)")
    print("─" * 45)
    cur.execute("SELECT COUNT(*) FROM signals")
    print(f"Total signals: {cur.fetchone()[0]}")

    print("\nBy Path:")
    cur.execute("SELECT p.icon, p.label, COUNT(s.id) FROM paths p LEFT JOIN signals s ON s.path=p.id GROUP BY p.id,p.icon,p.label ORDER BY COUNT(s.id) DESC")
    for r in cur.fetchall(): print(f"  {r[0]} {r[1]}: {r[2]}")

    print("\nBy Type:")
    cur.execute("SELECT type, COUNT(*) FROM signals GROUP BY type ORDER BY COUNT(*) DESC")
    for r in cur.fetchall(): print(f"  {r[0]}: {r[1]}")

    print("\nTop 5 by Impact:")
    cur.execute("SELECT impact_score, title FROM signals ORDER BY impact_score DESC LIMIT 5")
    for r in cur.fetchall(): print(f"  [{r[0]}/10] {r[1]}")
    
    print()
    cur.close(); conn.close()


def search_signals(query):
    conn = get_conn()
    cur = conn.cursor()
    q = f"%{query}%"
    cur.execute("SELECT id,title,player,path,type,impact_score FROM signals WHERE title ILIKE %s OR detail ILIKE %s OR player ILIKE %s ORDER BY impact_score DESC", (q, q, q))
    rows = cur.fetchall()
    if not rows:
        print(f'No signals matching "{query}"')
    else:
        print(f'Found {len(rows)} signals matching "{query}":\n')
        for r in rows:
            print(f"  [{r[5]}/10] {r[1]} ({r[2]}) — {r[3]}/{r[4]}")
    cur.close(); conn.close()


def list_signals(path_filter=None, type_filter=None):
    conn = get_conn()
    cur = conn.cursor()
    where, params = [], []
    if path_filter: where.append("path = %s"); params.append(path_filter)
    if type_filter: where.append("type = %s"); params.append(type_filter)
    w = f"WHERE {' AND '.join(where)}" if where else ""
    cur.execute(f"SELECT id,title,player,path,type,date,impact_score FROM signals {w} ORDER BY date DESC", params)
    rows = cur.fetchall()
    print(f"{len(rows)} signals:\n")
    for r in rows:
        print(f"  [{r[6]}/10] {r[5]} | {r[1]} ({r[2]}) — {r[3]}/{r[4]}")
    cur.close(); conn.close()


# ─── CLI ──────────────────────────────────────────────────
if __name__ == "__main__":
    args = sys.argv[1:]
    if '--stats' in args:
        show_stats()
    elif '--export' in args:
        export_data()
    elif '--export-api' in args:
        export_api()
    elif '--add' in args:
        idx = args.index('--add')
        if idx + 1 >= len(args):
            print('Usage: python3 db.py --add \'{"title":"..."}\'')
            sys.exit(0)
        addSignal(json.loads(args[idx + 1]))
    elif '--search' in args:
        idx = args.index('--search')
        search_signals(args[idx + 1] if idx + 1 < len(args) else '')
    elif '--list' in args:
        pf = args[args.index('--path') + 1] if '--path' in args else None
        tf = args[args.index('--type') + 1] if '--type' in args else None
        list_signals(pf, tf)
    else:
        print("""
🧩 Claw Dots — Database CLI (Neon PostgreSQL)

  python3 db.py --stats               Database stats
  python3 db.py --add '{...}'         Add signal
  python3 db.py --export              Export → data.json (website)
  python3 db.py --export-api          Export → api.json (full data)
  python3 db.py --list [--path X]     List signals
  python3 db.py --search "query"      Search signals
        """)
