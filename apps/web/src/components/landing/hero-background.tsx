"use client"

import { useEffect, useRef } from "react"

/**
 * Animated hero background with Vercel-style grid lines and
 * floating notification-related nodes (envelopes, webhooks, etc.)
 * that drift slowly across the canvas.
 */
export default function HeroBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches

    let raf: number
    let w = 0
    let h = 0

    const AMBER = { r: 245, g: 158, b: 11 }
    const GRID_SIZE = 56
    const NODE_COUNT = 10

    // Floating nodes representing notification concepts
    type Node = {
      x: number
      y: number
      vx: number
      vy: number
      size: number
      opacity: number
      symbol: string
      pulsePhase: number
    }

    const symbols = ["✉", "⚡", "↻", "⟐", "◆", "▲", "●", "◇", "⬡", "⊡"]
    let nodes: Node[] = []

    function initNodes() {
      nodes = Array.from({ length: NODE_COUNT }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h * 0.8,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.15,
        size: 12 + Math.random() * 8,
        opacity: 0.1 + Math.random() * 0.15,
        symbol: symbols[i % symbols.length],
        pulsePhase: Math.random() * Math.PI * 2,
      }))
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas!.getBoundingClientRect()
      w = rect.width
      h = rect.height
      canvas!.width = w * dpr
      canvas!.height = h * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)

      if (nodes.length === 0) initNodes()
    }

    function drawGrid(time: number) {
      if (!ctx) return

      // Vertical lines
      const cols = Math.ceil(w / GRID_SIZE) + 1
      const rows = Math.ceil(h / GRID_SIZE) + 1
      const centerX = w / 2
      const centerY = h * 0.35

      for (let i = 0; i <= cols; i++) {
        const x = i * GRID_SIZE
        const distFromCenter = Math.abs(x - centerX) / (w * 0.5)
        const fade = Math.max(0, 1 - distFromCenter)
        const alpha = 0.03 + 0.09 * fade

        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.strokeStyle = `rgba(${AMBER.r}, ${AMBER.g}, ${AMBER.b}, ${alpha})`
        ctx.lineWidth = 0.5
        ctx.stroke()
      }

      // Horizontal lines
      for (let j = 0; j <= rows; j++) {
        const y = j * GRID_SIZE
        const distFromCenter = Math.abs(y - centerY) / (h * 0.6)
        const fade = Math.max(0, 1 - distFromCenter)
        const alpha = 0.03 + 0.09 * fade

        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.strokeStyle = `rgba(${AMBER.r}, ${AMBER.g}, ${AMBER.b}, ${alpha})`
        ctx.lineWidth = 0.5
        ctx.stroke()
      }

      // Glowing intersection dots near center
      for (let i = 0; i <= cols; i++) {
        for (let j = 0; j <= rows; j++) {
          const x = i * GRID_SIZE
          const y = j * GRID_SIZE
          const dx = (x - centerX) / (w * 0.5)
          const dy = (y - centerY) / (h * 0.5)
          const dist = Math.sqrt(dx * dx + dy * dy)
          const fade = Math.max(0, 1 - dist)

          if (fade > 0.05) {
            const pulse =
              0.5 +
              0.5 * Math.sin(time * 0.001 + i * 0.5 + j * 0.7)
            const dotAlpha = 0.25 * fade * (0.5 + 0.5 * pulse)

            ctx.beginPath()
            ctx.arc(x, y, 1.8, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(${AMBER.r}, ${AMBER.g}, ${AMBER.b}, ${dotAlpha})`
            ctx.fill()
          }
        }
      }
    }

    function drawNodes(time: number) {
      if (!ctx) return

      for (const node of nodes) {
        // Update position
        if (!prefersReducedMotion) {
          node.x += node.vx
          node.y += node.vy

          // Wrap around
          if (node.x < -20) node.x = w + 20
          if (node.x > w + 20) node.x = -20
          if (node.y < -20) node.y = h + 20
          if (node.y > h + 20) node.y = -20
        }

        // Pulse opacity
        const pulse = Math.sin(time * 0.0008 + node.pulsePhase)
        const alpha = node.opacity * (0.7 + 0.3 * pulse)

        // Draw glow circle behind node
        const gradient = ctx.createRadialGradient(
          node.x,
          node.y,
          0,
          node.x,
          node.y,
          node.size * 2.5
        )
        gradient.addColorStop(
          0,
          `rgba(${AMBER.r}, ${AMBER.g}, ${AMBER.b}, ${alpha * 0.5})`
        )
        gradient.addColorStop(1, "transparent")
        ctx.fillStyle = gradient
        ctx.fillRect(
          node.x - node.size * 2.5,
          node.y - node.size * 2.5,
          node.size * 5,
          node.size * 5
        )

        // Draw symbol
        ctx.font = `${node.size}px system-ui, sans-serif`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillStyle = `rgba(${AMBER.r}, ${AMBER.g}, ${AMBER.b}, ${alpha})`
        ctx.fillText(node.symbol, node.x, node.y)
      }

      // Draw faint connection lines between nearby nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < 280) {
            const lineAlpha = 0.08 * (1 - dist / 280)
            ctx.beginPath()
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.strokeStyle = `rgba(${AMBER.r}, ${AMBER.g}, ${AMBER.b}, ${lineAlpha})`
            ctx.lineWidth = 0.5
            ctx.stroke()
          }
        }
      }
    }

    function draw(time: number) {
      if (!ctx) return
      ctx.clearRect(0, 0, w, h)

      drawGrid(time)
      drawNodes(time)

      raf = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener("resize", resize)

    if (prefersReducedMotion) {
      // Draw a single frame
      drawGrid(0)
      drawNodes(0)
    } else {
      raf = requestAnimationFrame(draw)
    }

    return () => {
      window.removeEventListener("resize", resize)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
      aria-hidden="true"
    />
  )
}
