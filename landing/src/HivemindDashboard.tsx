import { useState, useEffect } from "react";

const HUB_URL = import.meta.env.VITE_HUB_URL || "https://hivemind.aethera-s1.com";

interface NetworkStats {
  totalAgents: number;
  onlineNow: number;
  totalLessons: number;
}

interface AggregatedSignal {
  symbol: string;
  longs: number;
  shorts: number;
  avgConfidence: number;
  totalVotes: number;
}

interface Lesson {
  id: string;
  agentId: string;
  username?: string;
  lessonJson: string;
  tags: string;
  win: number;
  timestamp: string;
}

interface LeaderboardEntry {
  username: string;
  wins: number;
  totalPnl: number;
  wr: number;
}

function HivemindDashboard() {
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [signals, setSignals] = useState<AggregatedSignal[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [statsRes, signalRes, lessonRes, lbRes] = await Promise.all([
          fetch(`${HUB_URL}/api/hivemind/stats/network`),
          fetch(`${HUB_URL}/api/hivemind/signal/aggregated?min=1`),
          fetch(`${HUB_URL}/api/hivemind/lesson/list?limit=20`),
          fetch(`${HUB_URL}/api/hivemind/stats/leaderboard?limit=10`),
        ]);
        if (statsRes.ok) {
          const d = await statsRes.json();
          setStats(d);
        }
        if (signalRes.ok) {
          const d = await signalRes.json() as { signals: AggregatedSignal[] };
          setSignals(d.signals || []);
        }
        if (lessonRes.ok) {
          const d = await lessonRes.json() as { lessons: Lesson[] };
          setLessons(d.lessons || []);
        }
        if (lbRes.ok) {
          const d = await lbRes.json() as { leaderboard: LeaderboardEntry[] };
          setLeaderboard(d.leaderboard || []);
        }
      } catch {
        // hub offline
      }
    }
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#0e130e] text-[#e8eee3]">
      <nav className="flex items-center justify-between px-4 sm:px-6 md:px-10 py-4 sm:py-5 border-b border-white/5">
        <a href="/" className="flex items-center gap-2 text-[#e8eee3] no-underline">
          <span className="text-lg sm:text-xl font-semibold tracking-tight">
            Aethera<sup className="text-[10px] sm:text-xs font-medium text-[#85AB8B]">Hivemind</sup>
          </span>
        </a>
        <div className="flex items-center gap-4">
          <a href="/" className="text-sm text-[#9baa95] hover:text-[#e8eee3] transition-colors no-underline">
            Home
          </a>
          <span className="text-xs text-[#6b7d65]">Auto-refresh 30s</span>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Network Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-center">
              <div className="text-2xl font-semibold text-[#85AB8B]">{stats.totalAgents}</div>
              <div className="text-xs text-[#9baa95] mt-1">Total Agents</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-center">
              <div className="text-2xl font-semibold text-[#85AB8B]">
                {stats.onlineNow}
                <span className={`inline-block w-2 h-2 rounded-full ml-2 ${stats.onlineNow > 0 ? 'bg-[#85AB8B] animate-pulse' : 'bg-[#6b7d65]'}`} />
              </div>
              <div className="text-xs text-[#9baa95] mt-1">Online Now</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-center">
              <div className="text-2xl font-semibold text-[#85AB8B]">{stats.totalLessons}</div>
              <div className="text-xs text-[#9baa95] mt-1">Shared Lessons</div>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {/* Aggregated Signals */}
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
            <h2 className="text-sm font-semibold text-[#85AB8B] uppercase tracking-wider mb-4">Aggregated Signals</h2>
            {signals.length === 0 ? (
              <p className="text-sm text-[#6b7d65]">No signals yet</p>
            ) : (
              <div className="space-y-2">
                {signals.map((s) => (
                  <div key={s.symbol} className="flex items-center justify-between text-sm py-1.5 border-b border-white/5 last:border-0">
                    <span className="font-medium">{s.symbol}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[#85AB8B]">L {s.longs}</span>
                      <span className="text-[#e8eee3]/60">|</span>
                      <span className="text-[#e07070]">S {s.shorts}</span>
                      <span className="text-[#6b7d65]">{(s.avgConfidence * 100).toFixed(0)}%</span>
                      <span className="text-[#6b7d65]">{s.totalVotes}v</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Leaderboard */}
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
            <h2 className="text-sm font-semibold text-[#85AB8B] uppercase tracking-wider mb-4">Leaderboard</h2>
            {leaderboard.length === 0 ? (
              <p className="text-sm text-[#6b7d65]">No data yet</p>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((e, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[#6b7d65] w-4">#{i + 1}</span>
                      <span className="font-medium">{e.username}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[#85AB8B]">{(e.wr * 100).toFixed(0)}%</span>
                      <span className={e.totalPnl >= 0 ? "text-[#85AB8B]" : "text-[#e07070]"}>
                        ${e.totalPnl.toFixed(0)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Shared Lessons */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 mb-8">
          <h2 className="text-sm font-semibold text-[#85AB8B] uppercase tracking-wider mb-4">Recent Lessons</h2>
          {lessons.length === 0 ? (
            <p className="text-sm text-[#6b7d65]">No lessons shared yet</p>
          ) : (
            <div className="space-y-3">
              {lessons.map((l) => (
                <div key={l.id} className="text-sm py-2 border-b border-white/5 last:border-0">
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-[#e8eee3]">{l.lessonJson.slice(0, 200)}</span>
                    <span className={`text-xs shrink-0 ${l.win ? 'text-[#85AB8B]' : 'text-[#e07070]'}`}>
                      {l.win ? 'win' : 'loss'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-[#6b7d65]">{l.username || 'anonymous'}</span>
                    {l.tags && <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-[#6b7d65]">{l.tags}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* REST API Reference */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
          <h2 className="text-sm font-semibold text-[#85AB8B] uppercase tracking-wider mb-4">API Endpoints</h2>
          <div className="text-xs text-[#9baa95] space-y-1 font-mono">
            <div><span className="text-[#85AB8B]">GET</span> /api/hivemind/stats/network</div>
            <div><span className="text-[#85AB8B]">GET</span> /api/hivemind/signal/aggregated?min=1</div>
            <div><span className="text-[#85AB8B]">GET</span> /api/hivemind/lesson/list?limit=20</div>
            <div><span className="text-[#85AB8B]">GET</span> /api/hivemind/stats/leaderboard?limit=10</div>
            <div className="mt-2 text-[#6b7d65]">All endpoints return JSON. Replace ?min= for signal aggregation threshold.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HivemindDashboard;
