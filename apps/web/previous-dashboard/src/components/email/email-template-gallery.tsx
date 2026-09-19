"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Desktop, DeviceMobile, MagnifyingGlass, Moon, Sun } from "@phosphor-icons/react";
import { emailTemplates } from "@/lib/email-templates";
import { BeacoEmailPreview, type EmailColorScheme } from "./beaco-email-preview";
import BrandLogo from "@/components/brand/brand-logo";

export function EmailTemplateGallery() {
  const [selectedId, setSelectedId] = useState(emailTemplates[0].id);
  const [query, setQuery] = useState("");
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [colorScheme, setColorScheme] = useState<EmailColorScheme>("dark");
  const filtered = useMemo(() => emailTemplates.filter((item) => `${item.name} ${item.subject} ${item.category}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const selected = emailTemplates.find((item) => item.id === selectedId) ?? emailTemplates[0];

  return (
    <main id="main-content" className="min-h-dvh bg-[#0b0b0a] text-[#eeeae0]">
      <header className="flex min-h-16 items-center justify-between border-b border-white/10 px-4 sm:px-6">
        <div className="flex items-center gap-4"><Link href="/" aria-label="Back to Beaco"><ArrowLeft size={18} /></Link><BrandLogo markClassName="size-7" /><span className="hidden border-l border-white/10 pl-4 text-[12px] text-white/50 sm:inline">Email templates</span></div>
        <span className="font-mono text-[11px] text-white/45">{emailTemplates.length} REVIEW ITEMS</span>
      </header>
      <div className="grid min-h-[calc(100dvh-4rem)] min-w-0 grid-cols-1 lg:grid-cols-[18rem_minmax(0,1fr)_19rem]">
        <aside className="min-w-0 border-b border-white/10 p-4 lg:border-b-0 lg:border-r lg:p-5">
          <label className="relative block"><MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" /><span className="sr-only">Search templates</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search templates" className="h-11 w-full rounded-lg border border-white/10 bg-white/[0.035] pl-9 pr-3 text-[13px] outline-none focus:border-[#e9aa31]" /></label>
          <div className="mt-5 flex gap-2 overflow-x-auto lg:block lg:space-y-1">
            {filtered.map((template, index) => <button key={template.id} onClick={() => setSelectedId(template.id)} className={`min-w-[13rem] rounded-lg px-3 py-3 text-left transition lg:w-full ${selected.id === template.id ? "bg-white/[0.08] text-white" : "text-white/55 hover:bg-white/[0.04] hover:text-white/80"}`}><span className="font-mono text-[10px] text-[#e9aa31]">0{index + 1}</span><span className="ml-3 text-[12px] font-medium">{template.name}</span><span className="mt-1.5 block pl-7 text-[10px] text-white/35">{template.category}</span></button>)}
          </div>
        </aside>

        <section className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6">
            <div><p className="text-[12px] font-medium">{selected.name}</p><p className="mt-1 text-[11px] text-white/40">Subject: {selected.subject}</p></div>
            <div className="flex flex-wrap gap-2">
              <div className="flex rounded-lg border border-white/10 p-1"><button aria-label="Light email preview" onClick={() => setColorScheme("light")} className={`grid size-9 place-items-center rounded-md ${colorScheme === "light" ? "bg-white/10 text-[#e9aa31]" : "text-white/40"}`}><Sun size={17} /></button><button aria-label="Dark email preview" onClick={() => setColorScheme("dark")} className={`grid size-9 place-items-center rounded-md ${colorScheme === "dark" ? "bg-white/10 text-[#e9aa31]" : "text-white/40"}`}><Moon size={17} /></button></div>
              <div className="flex rounded-lg border border-white/10 p-1"><button aria-label="Desktop preview" onClick={() => setViewport("desktop")} className={`grid size-9 place-items-center rounded-md ${viewport === "desktop" ? "bg-white/10 text-[#e9aa31]" : "text-white/40"}`}><Desktop size={17} /></button><button aria-label="Mobile preview" onClick={() => setViewport("mobile")} className={`grid size-9 place-items-center rounded-md ${viewport === "mobile" ? "bg-white/10 text-[#e9aa31]" : "text-white/40"}`}><DeviceMobile size={17} /></button></div>
            </div>
          </div>
          <div className="min-h-[calc(100dvh-8.5rem)] overflow-auto bg-[#161614] p-4 sm:p-8">
            <div className={`mx-auto transition-all ${viewport === "mobile" ? "max-w-[390px]" : "max-w-[760px]"}`}><BeacoEmailPreview template={selected} colorScheme={colorScheme} /></div>
          </div>
        </section>

        <aside className="min-w-0 border-t border-white/10 p-5 lg:border-l lg:border-t-0">
          <p className="font-mono text-[10px] tracking-[0.1em] text-white/35">DELIVERY CONTEXT</p>
          <dl className="mt-5 space-y-5 text-[12px]"><div><dt className="text-white/35">Audience</dt><dd className="mt-1.5 text-white/75">{selected.audience}</dd></div><div><dt className="text-white/35">Trigger</dt><dd className="mt-1.5 break-words font-mono text-[10px] leading-5 text-white/65">{selected.trigger}</dd></div><div><dt className="text-white/35">Integration</dt><dd className="mt-1.5 text-white/75">{selected.status === "proposed" ? "Proposed · not sent today" : "Integrated with the live sender"}</dd></div><div><dt className="text-white/35">Color handling</dt><dd className="mt-1.5 text-white/75">Light + dark aware · inversion-safe fallback</dd></div><div><dt className="text-white/35">Action destination</dt><dd className="mt-1.5 break-words font-mono text-[10px] leading-5 text-white/65">{selected.action.destination}</dd></div></dl>
          <p className="mt-8 font-mono text-[10px] tracking-[0.1em] text-white/35">VARIABLES</p>
          <div className="mt-4 flex flex-wrap gap-2">{selected.variables.map((variable) => <code key={variable} className="rounded bg-white/[0.06] px-2 py-1.5 text-[10px] text-[#e9aa31]">{`{{ ${variable} }}`}</code>)}</div>
          <p className="mt-8 border-l border-[#e9aa31] pl-4 text-[11px] leading-5 text-white/45">Magic-link and invitation designs are integrated. Account ready remains a proposed review item.</p>
        </aside>
      </div>
    </main>
  );
}
