# Agent Guidelines — Aethera Hivemind Hub (Server)

## Conversation Flow — Cara Memulai Diskusi Server

### Step 1: Cek Status
```
□ Server sudah di-deploy ke VPS? (lihat Deploy section)
□ Ada perubahan kode hub? → butuh rebuild + restart?
□ User minta tambah fitur hub?
```

### Step 2: Tanya User
```
Kalau user "lanjut" tanpa specify:
"Mau:
  1. Deploy hub ke VPS production?
  2. Tambah fitur hub (auth, rate limit, dll)?
   3. Update client side di agent/?"
```

### Step 3: Client vs Server — Jangan Tertukar
```
┌─ hub/ ────────────────────────┐    ┌─ agent/ ───────────────────┐
│  Ini yang di-deploy ke VPS      │    │  Ini yang dipake USER          │
│  hub/src/hub.ts — WS server      │    │  agent/src/hivemind/client.ts  │
│  hub/src/db.ts — JSON store      │    │  Config: hivemind.hub          │
│  endpoints — REST + WS           │    │  Orchestrator hook             │
└─────────────────────────────────┘    └───────────────────────────────┘
JANGAN campur aduk — hub server cuma di VPS, client ada di agent user.
```

### Checklist Edit Server
```
□ npm run typecheck (di hub/)
□ npm run build
□ kalau sudah deploy: git pull + npm run build + systemctl restart
```

## Overview
Central hub server untuk jaringan Aethera v2. Semua user agent connect ke sini buat share signal, lesson, dan weights. **User TIDAK perlu setup VPS sendiri** — cukup sewa VPS, jalanin hub ini, user lain tinggal connect.

```
User A (PC) ──WS──┐
User B (VPS) ──WS──┼──► Hivemind Hub (VPS ini) :8000
User C (Laptop) ──WS──┘
```

## Arsitektur

```
┌──────────────────────────────────────────────────────┐
│  hub/                                                   │

│  hub/src/hub.ts      ► Hono server + WebSocket server  │
│  hub/src/db.ts       ► JSON store (persisted ke disk)  │
│  hub/src/routes/                                       │
│    auth.ts           ► POST /register, /login          │
│    signal.ts         ► POST /vote, GET /aggregated     │
│    lesson.ts         ► POST /share, GET /list          │
│    stats.ts          ► GET /leaderboard, /network      │
│                                                       │
│  data/hivemind.json   ► Semua data persist             │
└──────────────────────────────────────────────────────┘
```

## REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/hivemind/auth/register` | Daftar username + api_key |
| POST | `/hivemind/auth/login` | Login, return agent_id |
| POST | `/hivemind/signal/vote` | Kirim vote signal |
| GET | `/hivemind/signal/aggregated` | Lihat aggregated signals |
| POST | `/hivemind/lesson/share` | Share lesson |
| GET | `/hivemind/lesson/list` | Lihat shared lessons |
| GET | `/hivemind/weights` | Lihat global weights |
| GET | `/hivemind/stats/leaderboard` | Leaderboard |
| GET | `/hivemind/stats/network` | Network stats |
| GET | `/health` | Health check |
| WS | `/hivemind/ws?api_key=xxx` | Real-time agent connection |

## WebSocket Protocol (Agent → Hub)

```json
// Agent kirim
{"type":"signal_vote", "symbol":"BTCUSDT", "direction":"LONG", "confidence":75}
{"type":"lesson_share", "lesson":{...}, "tags":"rsi_oversold", "win":0}
{"type":"weight_update", "signalName":"rsi", "weight":1.15}
{"type":"trade_result", "win":true, "pnl":12.5}
{"type":"ping"}

// Hub kirim ke semua agent
{"type":"connected", "agentId":"...", "username":"trader_abc"}
{"type":"signal_update", "aggregated":[{symbol, longs, shorts, ...}]}
{"type":"lesson_broadcast", "agentId":"...", "username":"...", "summary":"..."}
{"type":"weight_update", "signalName":"...", "weight":1.15}
{"type":"trade_broadcast", "agentId":"...", "win":true, "pnl":12.5}
{"type":"agent_join", "username":"...", "online":5}
{"type":"agent_leave", "username":"...", "online":4}
{"type":"pong"}
```

## Cara User Connect (Client Side — di agent/)

Di `config.yaml` user, tambahin:

```yaml
hivemind:
  enabled: true
  hub: "wss://your-vps-ip:8000/hivemind/ws"
  apiKey: "rahasia123"     # didaftarkan via register endpoint
  username: "trader_abc"   # optional
```

Saat `aethera start`:
1. Agent daftar/login ke hub via REST
2. Agent buka WS ke `/hivemind/ws?api_key=xxx`
3. Setiap signal detect → kirim `signal_vote`
4. Setiap lesson baru → kirim `lesson_share`
5. Setiap trade selesai → kirim `trade_result`
6. Terima broadcast dari agent lain → tampilkan di TUI

## Deploy ke VPS

```bash
# 1. SSH ke VPS
ssh root@<vps-ip>

# 2. Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs git

# 3. Clone project
git clone <repo-url> server-aethera-v2
cd server-aethera-v2
npm install

# 4. Build
npm run build

# 5. Systemd service
cat > /etc/systemd/system/aethera-hub.service << 'EOF'
[Unit]
Description=Aethera Hivemind Hub
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/server-aethera-v2
ExecStart=/usr/bin/node dist/hub.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=8000

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now aethera-hub

# 6. Firewall
ufw allow 22/tcp
ufw allow 8000/tcp
ufw --force enable

# 7. Verifikasi
curl http://localhost:8000/health
# → {"status":"ok","service":"aethera-hivemind-hub"}
```

## Agent Daftar (Register)

```bash
curl -X POST http://localhost:8000/hivemind/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"trader_abc","apiKey":"rahasia123"}'
# → {"ok":true,"agentId":"uuid..."}
```

## Upgrade (Zero-downtime)

```bash
git pull
npm install
npm run build
systemctl restart aethera-hub
```

## File Penting

| File | Purpose |
|------|---------|
| `src/hub.ts` | Main entry — Hono + WebSocket |
| `src/db.ts` | JSON store (in-memory + persist) |
| `src/routes/auth.ts` | Agent registration/login |
| `src/routes/signal.ts` | Signal voting |
| `src/routes/lesson.ts` | Lesson sharing |
| `src/routes/stats.ts` | Leaderboard + network stats |

## Critical Gotchas

1. **API Key**: Setiap agent punya API key unik — register dulu sebelum connect WS
2. **JSON Store**: Data persist di `data/hivemind.json` — backup rutin
3. **WS Path**: Hanya `/hivemind/ws` yang di-accept — path lain ditolak
4. **Memory**: Store in-memory, maks 1000 lessons & 10000 votes — auto prune
5. **Security**: Pasang Nginx reverse proxy + SSL/HTTPS untuk production
6. **Rate Limit**: Belum ada — perlu ditambah untuk public deployment

## Checklist Deploy

- [ ] VPS created (Ubuntu 22.04+, minimal $5/bln)
- [ ] Node.js 22 installed
- [ ] Project cloned, `npm install`, `npm run build`
- [ ] Systemd service created + enabled
- [ ] Firewall open port 8000 (atau via reverse proxy)
- [ ] `curl /health` returns 200
- [ ] Register test agent
- [ ] Connect test WS (wscat atau script)
