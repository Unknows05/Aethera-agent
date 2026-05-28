import { useEffect, useState, useCallback } from "react"
import { SwarmGraph } from "./components/ui/swarm-graph"
import {
  Brain, Activity, ArrowLeft, RefreshCw,
  CheckCircle2, Users, BookOpen,
  BarChart3, Zap,
} from "lucide-react"

interface Agent {
  id: string
  label: string
  version: string
  lastSeen: string
  totalTrades: number
  wins: number
  losses: number
  winRatePct: number
  active: boolean
}

interface Lesson {
  id: string
  agentId: string
  rule: string
  tags: string[]
  regime: string
  signal: string
  outcome: string
  confidence: number
  score: number
  consensus: string
  timestamp: string
}

interface Edge {
  from: string
  to: string
  type: string
}

interface TerminalItem {
  at: string
  line: string
}

export default function App() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [terminalFeed, setTerminalFeed] = useState<TerminalItem[]>([])
  const [loading, setLoading] = useState(true)
  const [lastFetch, setLastFetch] = useState("")
  const [activeTab, setActiveTab] = useState<"leaderboard" | "terminal">("leaderboard")
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [totalAgents, setTotalAgents] = useState(0)
  const [totalLessons, setTotalLessons] = useState(0)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [netRes, sigRes, lesRes, lbRes] = await Promise.all([
        fetch("/api/hivemind/stats/network"),
        fetch("/api/hivemind/signal/aggregated?min=1"),
        fetch("/api/hivemind/lesson/list?limit=20"),
        fetch("/api/hivemind/stats/leaderboard?limit=10"),
      ])

      if (netRes.ok) {
        const net = await netRes.json()
        setTotalAgents(net.totalAgents || 0)
        setTotalLessons(net.totalLessons || 0)
        setEdges([])
      }

      if (sigRes.ok) {
        const sig = await sigRes.json() as { signals: Array<{ symbol: string; longs: number; shorts: number; avgConfidence: number; totalVotes: number }> }
        setTerminalFeed(
          (sig.signals || []).map((s) => ({
            at: new Date().toISOString(),
            line: `${s.symbol} L:${s.longs} S:${s.shorts} ${(s.avgConfidence * 100).toFixed(0)}% (${s.totalVotes}v)`,
          })),
        )
      }

      if (lesRes.ok) {
        const les = await lesRes.json() as { lessons: Array<{ id: string; agentId: string; username?: string; lessonJson: string; tags: string; win: number; timestamp: string }> }
        setLessons(
          (les.lessons || []).map((l) => {
            let rule = l.lessonJson
            try { const p = JSON.parse(l.lessonJson); rule = p.pattern || p.rule || p.summary || l.lessonJson } catch { /* */ }
            return {
              id: l.id,
              agentId: l.agentId,
              rule: typeof rule === "string" ? rule.slice(0, 200) : String(rule).slice(0, 200),
              tags: l.tags ? l.tags.split(",").map((t) => t.trim()) : [],
              regime: "",
              signal: "",
              outcome: l.win ? "win" : "loss",
              confidence: 70,
              score: l.win ? 1 : 0,
              consensus: l.win ? "strong" : "disputed",
              timestamp: l.timestamp,
            }
          }),
        )
      }

      if (lbRes.ok) {
        const lb = await lbRes.json() as { leaderboard: Array<{ username: string; wins: number; totalPnl: number; wr: number }> }
        setAgents(
          (lb.leaderboard || []).map((e, i) => ({
            id: `agent_${i}`,
            label: e.username,
            version: "2.1.1",
            lastSeen: new Date().toISOString(),
            totalTrades: e.wins,
            wins: e.wins,
            losses: 0,
            winRatePct: Math.round(e.wr * 100),
            active: true,
          })),
        )
        setLastFetch(new Date().toLocaleTimeString())
      }
    } catch (e) {
      console.error("Fetch error:", e)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  const sortedAgents = [...agents].sort((a, b) => b.winRatePct - a.winRatePct)

  function agentColor(a: Agent): string {
    if (a.winRatePct > 60) return "text-emerald-400"
    if (a.winRatePct > 40) return "text-blue-400"
    return "text-gray-400"
  }

  function agentDotColor(a: Agent): string {
    if (a.winRatePct > 60) return "#34d399"
    if (a.winRatePct > 40) return "#60a5fa"
    return "#9ca3af"
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Nav */}
      <header className="flex-shrink-0 border-b border-white/5 bg-black/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-full items-center justify-between px-6 h-14">
          <div className="flex items-center gap-4">
            <a href="https://aethera-s1.com" className="flex items-center gap-2 text-gray-400 hover:text-white transition">
              <ArrowLeft className="size-4" />
              <span className="text-sm">Aethera</span>
            </a>
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-purple-600">
                <Brain className="size-3.5 text-white" />
              </div>
              <span className="text-sm font-bold tracking-wider">HIVEMIND</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-600">{lastFetch && `Updated ${lastFetch}`}</span>
            <button onClick={fetchData} className="p-1.5 rounded-lg hover:bg-white/5 transition" disabled={loading}>
              <RefreshCw className={`size-3.5 text-gray-400 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Graph Stage */}
        <div className="flex-1 relative">
          {loading && agents.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <RefreshCw className="size-8 text-purple-400 animate-spin mx-auto mb-4" />
                <p className="text-gray-500">Loading swarm...</p>
              </div>
            </div>
          ) : (
            <SwarmGraph agents={agents} lessons={lessons} edges={edges} onSelectNode={setSelectedNode} />
          )}

          {/* Overlay stats */}
          <div className="absolute top-4 left-4 z-10 flex gap-3">
            <div className="px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/5">
              <div className="flex items-center gap-2">
                <Users className="size-3.5 text-purple-400" />
                <span className="text-sm font-semibold">{totalAgents}</span>
                <span className="text-xs text-gray-500">agents</span>
              </div>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/5">
              <div className="flex items-center gap-2">
                <BookOpen className="size-3.5 text-cyan-400" />
                <span className="text-sm font-semibold">{totalLessons}</span>
                <span className="text-xs text-gray-500">lessons</span>
              </div>
            </div>
          </div>

          {/* Selected node info */}
          {selectedNode && (
            <div className="absolute bottom-4 left-4 z-10 max-w-sm px-4 py-3 rounded-xl bg-black/80 backdrop-blur-xl border border-white/10">
              {selectedNode.kind === "agent" ? (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full" style={{ background: agentDotColor(selectedNode) }} />
                    <span className="text-sm font-semibold">{selectedNode.label}</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    v{selectedNode.version} | {selectedNode.winRatePct}% win | {selectedNode.totalTrades} trades
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Last seen: {new Date(selectedNode.lastSeen).toLocaleString()}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${selectedNode.consensus === "strong" ? "bg-purple-500/20 text-purple-400" : selectedNode.consensus === "disputed" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}`}>
                      {selectedNode.consensus}
                    </span>
                    <span className="text-xs text-gray-500">score: {selectedNode.score}</span>
                  </div>
                  <div className="text-sm text-gray-300">{selectedNode.rule}</div>
                  {selectedNode.regime && (
                    <div className="text-xs text-gray-500 mt-1">regime: {selectedNode.regime} | signal: {selectedNode.signal}</div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="w-80 flex-shrink-0 border-l border-white/5 bg-black/40 backdrop-blur-sm flex flex-col">
          {/* Tabs */}
          <div className="flex gap-4 px-4 pt-4 border-b border-white/5">
            <button
              onClick={() => setActiveTab("leaderboard")}
              className={`pb-3 text-sm font-medium transition relative ${activeTab === "leaderboard" ? "text-white" : "text-gray-500 hover:text-gray-300"}`}
            >
              <div className="flex items-center gap-1.5">
                <BarChart3 className="size-3.5" />
                Leaderboard
              </div>
              {activeTab === "leaderboard" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500" />}
            </button>
            <button
              onClick={() => setActiveTab("terminal")}
              className={`pb-3 text-sm font-medium transition relative ${activeTab === "terminal" ? "text-white" : "text-gray-500 hover:text-gray-300"}`}
            >
              <div className="flex items-center gap-1.5">
                <Zap className="size-3.5" />
                Terminal
              </div>
              {activeTab === "terminal" && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500" />}
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === "leaderboard" ? (
              <div className="p-3">
                {sortedAgents.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    <Users className="size-8 mx-auto mb-2 opacity-30" />
                    No agents in swarm yet
                  </div>
                ) : (
                  sortedAgents.map((a, i) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between py-2.5 px-2 rounded-lg hover:bg-white/5 transition cursor-pointer"
                      onMouseEnter={() => setSelectedNode(a)}
                      onMouseLeave={() => setSelectedNode(null)}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs text-gray-600 w-5">#{i + 1}</span>
                        <div className="w-2 h-2 rounded-full" style={{ background: agentDotColor(a) }} />
                        <div>
                          <div className="text-sm text-gray-300">{a.label}</div>
                          <div className="text-xs text-gray-600">{a.totalTrades} trades</div>
                        </div>
                      </div>
                      <span className={`text-sm font-semibold ${agentColor(a)}`}>{a.winRatePct}%</span>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="p-3 font-mono text-xs">
                {terminalFeed.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Activity className="size-8 mx-auto mb-2 opacity-30" />
                    No swarm activity yet
                  </div>
                ) : (
                  terminalFeed.map((item, i) => (
                    <div key={i} className="py-1.5 border-b border-white/5">
                      <span className="text-blue-400">{new Date(item.at).toLocaleTimeString()}</span>
                      <span className="text-gray-500 ml-1.5">{item.line}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Footer bar */}
      <footer className="flex-shrink-0 border-t border-white/5 px-6 py-2 flex items-center justify-between text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-3 text-emerald-400" />
          <span>Swarm Online</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="https://aethera-s1.com" className="hover:text-gray-400 transition">Aethera</a>
          <a href="/api/hivemind/health" className="hover:text-gray-400 transition">Health</a>
          <a href="/api/hivemind/stats" className="hover:text-gray-400 transition">Stats</a>
          <span>v1.5.0</span>
        </div>
      </footer>
    </div>
  )
}

