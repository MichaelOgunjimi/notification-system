"use client"

import { useEffect, useRef, type ReactNode } from "react"

type AnimateOnScrollProps = {
  children: ReactNode
  className?: string
  delay?: number
  /** Animation variant */
  variant?: "fade-up" | "fade-in" | "fade-left" | "fade-right" | "scale-in"
  /** Run animation once or every time element enters viewport */
  once?: boolean
}

export default function AnimateOnScroll({
  children,
  className = "",
  delay = 0,
  variant = "fade-up",
  once = true,
}: AnimateOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches

    if (prefersReducedMotion) {
      el.classList.add("aos-visible")
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Apply delay then reveal
          setTimeout(() => {
            el.classList.add("aos-visible")
          }, delay)
          if (once) observer.unobserve(el)
        } else if (!once) {
          el.classList.remove("aos-visible")
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [delay, once])

  return (
    <div ref={ref} className={`aos-init aos-${variant} ${className}`}>
      {children}
    </div>
  )
}

/** Wrapper that staggers children animations */
type StaggerProps = {
  children: ReactNode
  className?: string
  staggerMs?: number
  variant?: AnimateOnScrollProps["variant"]
}

export function StaggerGroup({
  children,
  className = "",
  staggerMs = 80,
  variant = "fade-up",
}: StaggerProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches

    const items = container.querySelectorAll<HTMLElement>(".aos-stagger-item")

    if (prefersReducedMotion) {
      items.forEach((el) => el.classList.add("aos-visible"))
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          items.forEach((el, i) => {
            setTimeout(() => el.classList.add("aos-visible"), i * staggerMs)
          })
          observer.unobserve(container)
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -30px 0px" }
    )

    observer.observe(container)
    return () => observer.disconnect()
  }, [staggerMs])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

/** Individual item inside a StaggerGroup */
export function StaggerItem({
  children,
  className = "",
  variant = "fade-up",
}: {
  children: ReactNode
  className?: string
  variant?: AnimateOnScrollProps["variant"]
}) {
  return (
    <div className={`aos-init aos-stagger-item aos-${variant} ${className}`}>
      {children}
    </div>
  )
}
