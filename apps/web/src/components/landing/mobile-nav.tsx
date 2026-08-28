"use client"

import Link from "next/link"
import { Menu, X } from "lucide-react"
import { useState } from "react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { docsUrl } from "@/lib/urls"

type MobileNavProps = {
  links: Array<{ label: string; href: string }>
}

export default function MobileNav({ links }: MobileNavProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex size-9 items-center justify-center rounded-lg border border-[var(--gray-4)] bg-[var(--gray-1)] text-[var(--gray-10)]"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
      </button>

      {open ? (
        <div className="absolute top-11 right-0 z-50 w-52 rounded-xl border border-[var(--gray-3)] bg-[var(--gray-1)] p-2 shadow-[0_0_36px_rgba(245,158,11,0.14)]">
          <div className="flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-[var(--gray-10)] hover:bg-[var(--gray-2)]"
              >
                {link.label}
              </Link>
            ))}
            <a
              href="https://github.com/michaelowiti/notification-system"
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm text-[var(--gray-10)] hover:bg-[var(--gray-2)]"
            >
              GitHub
            </a>
            <Link
              href={docsUrl("/quickstart")}
              onClick={() => setOpen(false)}
              className={cn(
                buttonVariants(),
                "mt-2 h-9 w-full bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[color:color-mix(in_oklab,var(--primary),black_18%)]"
              )}
            >
              Get Started
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
