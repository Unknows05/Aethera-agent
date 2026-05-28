# Aethera

Bot trading otomatis untuk Binance Futures. Jalan 24 jam — nyari sinyal, buka posisi, atur SL/TP, tutup sendiri.

## Butuh Ini

| Kebutuhan | Cara Dapat |
|-----------|-----------|
| Node.js 20+ | `nvm install 20` (atau download di nodejs.org) |
| Git | `sudo apt install git` (Linux) atau download git-scm.com |
| Binance API Key | Dashboard Binance → API Management → buat key baru |
| OpenRouter API Key | openrouter.ai → sign up → buat key |

> Kalau belum punya Node.js, pakai **Bun** — 1 detik install: `curl -fsSL https://bun.sh/install | bash`

## Install

**Linux / Mac:**
```bash
curl -fsSL https://raw.githubusercontent.com/Unknows05/Aethera-agent/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/Unknows05/Aethera-agent/main/install.ps1 | iex
```

Install selesai dalam ~2 menit. Semua otomatis.

## Jalankan

```bash
aethera init          ← isi API key, target profit, dll (sekali doang)
aethera start         ← bot jalan, tampilan layar penuh
```

**Udah. Bot jalan 24 jam. Tutup terminal → bot ikut mati.**  
Kalau mau bot tetap jalan walau terminal ditutup:

```bash
aethera daemon start  ← jalan di background
```

## Bot Ngapain Aja?

| Waktu | Kerjaan |
|-------|---------|
| Setiap 30 menit | Scan 500+ koin → hitung indikator → LLM pilih kandidat → buka posisi |
| Setiap 5 menit | Cek posisi → SL kena? TP kena? Kepalaman? → tutup otomatis |
| Real-time | Kirim sinyal ke dashboard, Telegram, server pusat |

## Di Dalam Satu Command

```
├── Scanner     — RSI, MACD, ADX, Bollinger, Volume, Orderbook
├── LLM         — OpenRouter (pilih model sendiri)
├── Risk        — Circuit breaker, drawdown limit, daily loss cap
├── Learning    — Catat performa tiap posisi, sesuaikan threshold
└── Hivemind    — Berbagi sinyal + pelajaran antar user
```

## Telegram

Biar bisa monitor dari HP:
```bash
aethera init  ← nanti diminta token Telegram
```
Kirim perintah ke bot:
```
/status      — saldo + posisi
/positions   — detail posisi
/close BTC  — tutup posisi
```

## Cara Hapus

```bash
aethera uninstall
```

## Disclaimer

Risk tinggi. Bot ini pake uang beneran. Bukan saran keuangan. Jangan deposit > rugi.
