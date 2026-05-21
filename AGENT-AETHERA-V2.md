# AGENT-AETHERA-V2

## Conversation Flow

1. User mulai sesi baru → bilang "lanjut" atau kasih task
2. **Aku** harus urut:
   - Baca file ini → tau harus baca file apa
   - Baca `agent/agent-aethera-v.md` → lihat progress + status v2
   - Baca `hub/server-aethera-v2.md` → kalau relevan sama hub
   - Lapor status ke user + tanya mau lanjut ke mana
3. **Jangan coding** sebelum user jawab

## File yang Wajib Dibaca Tiap Sesi

| Urutan | File | Lokasi |
|--------|------|--------|
| 1 | `AGENT-AETHERA-V2.md` | `Aethera-project-v2/AGENT-AETHERA-V2.md` |
| 2 | `agent-aethera-v.md` | `Aethera-project-v2/agent/agent-aethera-v.md` |
| 3 | `server-aethera-v2.md` | `Aethera-project-v2/hub/server-aethera-v2.md` (optional) |

## Workspaces (dalam satu project)

| Subproject | Path | Isi |
|-----------|------|-----|
| Agent | `Aethera-project-v2/agent/` | CLI, exchange, LLM, screening, risk, learning, orchestrator, API, TUI, hivemind client |
| Hub | `Aethera-project-v2/hub/` | Server hub VPS buat signal/lesson sharing antar user |
| Guide | `Aethera-project-v2/guide/` | Tutorial step-by-step pembangunan Aethera v2 |

## Aturan

- Bahasa Indonesia (kecuali user pakai Inggris)
- **JANGAN CODING TANPA IZIN** — review dulu, tanya dulu
- Sebelum edit: `npx vitest run` + `npx tsc --noEmit` (di `agent/`)
- Sesudah edit: verifikasi ulang test + typecheck
