"use client"

import { useEffect, useRef } from "react"

/**
 * Animated hero background with a fine signal grid and drifting
 * notification symbols. Density scales down on smaller screens.
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
    const GRID_SIZE = 36

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

    function initNodes(count: number) {
      nodes = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.12,
        size: 9 + Math.random() * 6,
        opacity: 0.08 + Math.random() * 0.13,
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

      const targetNodeCount = w < 640 ? 15 : w < 1024 ? 20 : 26
      if (nodes.length !== targetNodeCount) initNodes(targetNodeCount)
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
        const alpha = 0.025 + 0.065 * fade

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
        const alpha = 0.025 + 0.065 * fade

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
            const dotAlpha = 0.18 * fade * (0.5 + 0.5 * pulse)

            ctx.beginPath()
            ctx.arc(x, y, 1.25, 0, Math.PI * 2)
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
          node.size * 2
        )
        gradient.addColorStop(
          0,
          `rgba(${AMBER.r}, ${AMBER.g}, ${AMBER.b}, ${alpha * 0.5})`
        )
        gradient.addColorStop(1, "transparent")
        ctx.fillStyle = gradient
        ctx.fillRect(
          node.x - node.size * 2,
          node.y - node.size * 2,
          node.size * 4,
          node.size * 4
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

          if (dist < 170) {
            const lineAlpha = 0.055 * (1 - dist / 170)
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
      className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-80"
      aria-hidden="true"
    />
  )
}
