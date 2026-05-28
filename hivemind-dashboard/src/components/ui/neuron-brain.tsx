import { useEffect, useRef, useCallback } from "react"

interface Node {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string
  label: string
  group: string
}

interface Edge {
  from: string
  to: string
}

interface NeuronBrainProps {
  nodes?: { id: string; label: string; group: string }[]
  edges?: { from: string; to: string }[]
}

const defaultNodes = [
  { id: "hivemind", label: "HiveMind", group: "core" },
  { id: "ta", label: "TA Engine", group: "analysis" },
  { id: "sentiment", label: "Sentiment", group: "analysis" },
  { id: "risk", label: "Risk Mgmt", group: "core" },
  { id: "lessons", label: "Lessons", group: "swarm" },
  { id: "skills", label: "Skills", group: "swarm" },
  { id: "thresholds", label: "Thresholds", group: "swarm" },
  { id: "debate", label: "Debate", group: "core" },
  { id: "execution", label: "Execution", group: "core" },
  { id: "portfolio", label: "Portfolio", group: "core" },
  { id: "regime", label: "Regime", group: "analysis" },
  { id: "backtest", label: "Backtest", group: "analysis" },
  { id: "paper", label: "Paper Trade", group: "mode" },
  { id: "live", label: "Live Trade", group: "mode" },
  { id: "binance", label: "Binance", group: "exchange" },
  { id: "bybit", label: "Bybit", group: "exchange" },
  { id: "metrics", label: "Metrics", group: "core" },
  { id: "alerts", label: "Alerts", group: "core" },
]

const defaultEdges = [
  { from: "hivemind", to: "lessons" },
  { from: "hivemind", to: "skills" },
  { from: "hivemind", to: "thresholds" },
  { from: "ta", to: "regime" },
  { from: "ta", to: "debate" },
  { from: "sentiment", to: "debate" },
  { from: "regime", to: "risk" },
  { from: "risk", to: "execution" },
  { from: "debate", to: "execution" },
  { from: "execution", to: "portfolio" },
  { from: "execution", to: "metrics" },
  { from: "portfolio", to: "alerts" },
  { from: "lessons", to: "skills" },
  { from: "skills", to: "thresholds" },
  { from: "backtest", to: "ta" },
  { from: "backtest", to: "risk" },
  { from: "paper", to: "execution" },
  { from: "live", to: "execution" },
  { from: "binance", to: "execution" },
  { from: "bybit", to: "execution" },
  { from: "metrics", to: "hivemind" },
  { from: "ta", to: "sentiment" },
  { from: "hivemind", to: "risk" },
  { from: "regime", to: "debate" },
]

const groupColors: Record<string, string> = {
  core: "#a855f7",
  analysis: "#3b82f6",
  swarm: "#06b6d4",
  mode: "#10b981",
  exchange: "#f59e0b",
}

export function NeuronBrain({ nodes: propNodes, edges: propEdges }: NeuronBrainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nodesRef = useRef<Node[]>([])
  const edgesRef = useRef<Edge[]>([])

  const initNodes = useCallback(() => {
    const list = propNodes || defaultNodes
    const w = window.innerWidth
    const h = window.innerHeight
    return list.map((n) => ({
      id: n.id,
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      radius: n.group === "core" ? 6 : 4,
      color: groupColors[n.group] || "#a855f7",
      label: n.label,
      group: n.group,
    }))
  }, [propNodes])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    edgesRef.current = propEdges || defaultEdges
    nodesRef.current = initNodes()

    const resize = () => {
      const dpr = Math.max(1, window.devicePixelRatio)
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = window.innerWidth + "px"
      canvas.style.height = window.innerHeight + "px"
      ctx.scale(dpr, dpr)
    }
    resize()
    window.addEventListener("resize", resize)

    let animId: number
    const animate = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      ctx.fillStyle = "#000000"
      ctx.fillRect(0, 0, w, h)

      const nodes = nodesRef.current
      const edges = edgesRef.current

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = dist < 200 ? -0.02 : 0.005
          a.vx += (dx / dist) * force
          a.vy += (dy / dist) * force
          b.vx -= (dx / dist) * force
          b.vy -= (dy / dist) * force
        }
      }

      for (const e of edges) {
        const a = nodes.find((n) => n.id === e.from)
        const b = nodes.find((n) => n.id === e.to)
        if (!a || !b) continue
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = (dist - 150) * 0.0003
        a.vx += (dx / dist) * force
        a.vy += (dy / dist) * force
        b.vx -= (dx / dist) * force
        b.vy -= (dy / dist) * force
      }

      const cx = w / 2
      const cy = h / 2
      for (const n of nodes) {
        n.vx += (cx - n.x) * 0.00005
        n.vy += (cy - n.y) * 0.00005
        n.vx *= 0.95
        n.vy *= 0.95
        n.x += n.vx
        n.y += n.vy
        n.x = Math.max(50, Math.min(w - 50, n.x))
        n.y = Math.max(50, Math.min(h - 50, n.y))
      }

      for (const e of edges) {
        const a = nodes.find((n) => n.id === e.from)
        const b = nodes.find((n) => n.id === e.to)
        if (!a || !b) continue
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.strokeStyle = "rgba(168, 85, 247, 0.12)"
        ctx.lineWidth = 1
        ctx.stroke()
      }

      for (const n of nodes) {
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
        ctx.fillStyle = n.color
        ctx.fill()

        ctx.beginPath()
        ctx.arc(n.x, n.y, n.radius + 4, 0, Math.PI * 2)
        ctx.fillStyle = n.color + "20"
        ctx.fill()

        ctx.font = "11px system-ui, sans-serif"
        ctx.fillStyle = n.color + "90"
        ctx.textAlign = "center"
        ctx.fillText(n.label, n.x, n.y + n.radius + 14)
      }

      animId = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener("resize", resize)
    }
  }, [initNodes])

  return <canvas ref={canvasRef} className="fixed inset-0 z-0 block" />
}

