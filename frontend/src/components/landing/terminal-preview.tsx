"use client"

import { useEffect, useState } from "react"
import { Check, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"

export const CURL_COMMAND = `$ curl -X POST https://beacon.michaelogunjimi.com/api/v1/events`

const TERMINAL_TEXT = `$ curl -X POST https://beacon.michaelogunjimi.com/api/v1/events \\
  -H "X-API-Key: nk_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "event_type": "user.welcome",
    "channel": "email",
    "recipient": { "email": "user@example.com" },
    "data": { "name": "Alice", "plan": "Pro" }
  }'

✓ Event created — id: evt_8f3k2m1n
  Status: queued → processing → delivered
  Channel: email | Template: welcome-email`

type CopyButtonProps = {
  text: string
  label?: string
  iconOnly?: boolean
}

export function CopyCommandButton({
  text,
  label = "Copy",
  iconOnly = false,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timeout)
  }, [copied])

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? "icon-xs" : "xs"}
      onClick={handleCopy}
      aria-label={copied ? "Copied command" : "Copy command"}
      className="border-[var(--gray-4)] bg-[var(--gray-2)] text-[var(--gray-10)] hover:bg-[var(--gray-3)]"
    >
      {copied ? <Check className="size-3.5 text-[var(--primary)]" /> : <Copy className="size-3.5" />}
      {!iconOnly ? (copied ? "Copied" : label) : null}
    </Button>
  )
}

export default function TerminalPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--gray-3)] bg-[var(--gray-1)] shadow-[0_0_60px_rgba(245,158,11,0.08)]">
      <div className="flex items-center justify-between border-b border-[var(--gray-3)] bg-black/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="size-2.5 rounded-full bg-[var(--destructive)]" />
          <span className="size-2.5 rounded-full bg-[var(--primary)]" />
          <span className="size-2.5 rounded-full bg-[var(--status-delivered)]" />
        </div>
        <CopyCommandButton text={TERMINAL_TEXT} iconOnly />
      </div>
      <pre className="overflow-x-auto p-5 text-xs leading-relaxed text-[var(--gray-10)] sm:text-sm">
        <code>{TERMINAL_TEXT}</code>
      </pre>
    </div>
  )
}
