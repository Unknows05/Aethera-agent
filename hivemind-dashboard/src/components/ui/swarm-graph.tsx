import { useEffect, useRef, useState, useCallback } from "react"
import * as d3 from "d3"

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

interface SwarmGraphProps {
  agents: Agent[]
  lessons: Lesson[]
  edges: Edge[]
  onSelectNode?: (node: any) => void
}

function nodeColor(d: any): string {
  if (d.kind === "agent") {
    if (d.winRatePct > 60) return "#34d399"
    if (d.winRatePct > 40) return "#60a5fa"
    return "#9ca3af"
  }
  if (d.consensus === "strong") return "#a855f7"
  if (d.consensus === "disputed") return "#f87171"
  return "#fbbf24"
}

export function SwarmGraph({ agents, lessons, edges, onSelectNode }: SwarmGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)

  const buildGraph = useCallback(() => {
    if (!svgRef.current || !containerRef.current) return
    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    d3.select(svgRef.current).selectAll("*").remove()

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height])

    const g = svg.append("g")

    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on("zoom", (e) => g.attr("transform", e.transform))
    )

    const nodes: any[] = []
    const nodesMap = new Map<string, any>()

    lessons.forEach((l) => {
      const node = { ...l, kind: "lesson", id: l.id, x: Math.random() * width, y: Math.random() * height }
      nodes.push(node)
      nodesMap.set(l.id, node)
    })

    agents.forEach((a) => {
      const node = { ...a, kind: "agent", id: a.id, x: Math.random() * width, y: Math.random() * height }
      nodes.push(node)
      nodesMap.set(a.id, node)
    })

    const links = edges
      .filter((e) => nodesMap.has(e.from) && nodesMap.has(e.to))
      .map((e) => ({ source: e.from, target: e.to }))

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(120))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide().radius((d: any) => d.kind === "agent" ? 20 : 40))

    const link = g.append("g")
      .attr("stroke", "rgba(255,255,255,0.08)")
      .attr("stroke-width", 1.5)
      .selectAll("line")
      .data(links)
      .join("line")

    const node = g.append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d: any) => d.kind === "agent" ? 5 : 12)
      .attr("fill", (d: any) => nodeColor(d))
      .attr("stroke", (d: any) => d.kind === "agent" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.35)")
      .attr("stroke-width", (d: any) => d.kind === "agent" ? 1 : 2)
      .attr("cursor", "pointer")
      .call(
        d3.drag<any, any>()
          .on("start", (event) => { if (!event.active) simulation.alphaTarget(0.3).restart(); event.subject.fx = event.subject.x; event.subject.fy = event.subject.y })
          .on("drag", (event) => { event.subject.fx = event.x; event.subject.fy = event.y })
          .on("end", (event) => { if (!event.active) simulation.alphaTarget(0); event.subject.fx = null; event.subject.fy = null })
      )

    function resetVisuals() {
      node.attr("opacity", 1).attr("r", (d: any) => d.kind === "agent" ? 5 : 12)
        .attr("stroke", (d: any) => d.kind === "agent" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.35)")
      link.attr("opacity", 1).attr("stroke", "rgba(255,255,255,0.08)").attr("stroke-width", 1.5)
    }

    function highlight(target: any) {
      const related = new Set([target.id])
      links.forEach((e: any) => {
        const s = typeof e.source === "object" ? e.source.id : e.source
        const t = typeof e.target === "object" ? e.target.id : e.target
        if (s === target.id || t === target.id) { related.add(s); related.add(t) }
      })
      node.attr("opacity", (d: any) => related.has(d.id) ? 1 : 0.18)
        .attr("r", (d: any) => d.id === target.id ? (d.kind === "agent" ? 8 : 16) : (d.kind === "agent" ? 5 : 12))
        .attr("stroke", (d: any) => d.id === target.id ? "#ffffff" : (d.kind === "agent" ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.35)"))
      link.attr("opacity", (e: any) => {
        const s = e.source.id ?? e.source; const t = e.target.id ?? e.target
        return s === target.id || t === target.id ? 1 : 0.05
      }).attr("stroke", (e: any) => {
        const s = e.source.id ?? e.source; const t = e.target.id ?? e.target
        return s === target.id || t === target.id ? "rgba(168,85,247,0.55)" : "rgba(255,255,255,0.08)"
      })
    }

    node.on("mouseover", (event, d) => {
      highlight(d)
      const text = d.kind === "lesson"
        ? (d.rule || d.id).substring(0, 80)
        : `${d.label} | ${d.winRatePct}% win | ${d.totalTrades} trades`
      setTooltip({ x: event.clientX + 16, y: event.clientY + 16, text })
      if (onSelectNode) onSelectNode(d)
    })
    .on("mousemove", (event) => {
      setTooltip((prev) => prev ? { ...prev, x: event.clientX + 16, y: event.clientY + 16 } : null)
    })
    .on("mouseout", () => { resetVisuals(); setTooltip(null) })

    simulation.on("tick", () => {
      link.attr("x1", (d: any) => d.source.x).attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x).attr("y2", (d: any) => d.target.y)
      node.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y)
    })

    d3.timer((elapsed) => {
      if (nodes.length > 0) {
        const angle = elapsed * 0.0001
        simulation.force("center", d3.forceCenter(width / 2 + Math.cos(angle) * 50, height / 2 + Math.sin(angle) * 50))
        simulation.alpha(0.01).restart()
      }
    })

    return () => { simulation.stop() }
  }, [agents, lessons, edges, onSelectNode])

  useEffect(() => {
    buildGraph()
    const handleResize = () => buildGraph()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [buildGraph])

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <svg ref={svgRef} className="w-full h-full" style={{ cursor: "grab" }} />
      {tooltip && (
        <div
          className="fixed pointer-events-none z-50 px-3 py-2 text-xs rounded-lg bg-zinc-900/95 border border-white/10 text-white max-w-xs"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  )
}

