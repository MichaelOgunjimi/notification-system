import fs from "fs";
import path from "path";

export type DocSlug =
  | "introduction"
  | "quickstart"
  | "events"
  | "channels"
  | "templates"
  | "delivery"
  | "api-reference"
  | "architecture"
  | "webhooks";

export type DocGroup = "getting-started" | "guides" | "reference";

export interface TocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface DocDefinition {
  slug: DocSlug;
  title: string;
  description: string;
  group: DocGroup;
}

export const DOC_DEFINITIONS: DocDefinition[] = [
  {
    slug: "introduction",
    title: "Introduction",
    description: "What Beaco is, why it exists, and what makes it different.",
    group: "getting-started",
  },
  {
    slug: "quickstart",
    title: "Quickstart",
    description: "Get an API key and send your first event in minutes.",
    group: "getting-started",
  },
  {
    slug: "events",
    title: "Events",
    description: "How events work — lifecycle, priorities, and idempotency.",
    group: "guides",
  },
  {
    slug: "channels",
    title: "Channels",
    description: "Email, SMS, and webhook — configuration and behavior.",
    group: "guides",
  },
  {
    slug: "templates",
    title: "Templates",
    description: "Reusable notification templates with Jinja2 variables.",
    group: "guides",
  },
  {
    slug: "delivery",
    title: "Delivery Pipeline",
    description: "Queues, retries, dead-letter handling, and failure recovery.",
    group: "guides",
  },
  {
    slug: "api-reference",
    title: "API Reference",
    description: "Complete REST API documentation with request and response examples.",
    group: "reference",
  },
  {
    slug: "architecture",
    title: "Architecture",
    description: "System design, components, data flow, and scaling strategy.",
    group: "reference",
  },
  {
    slug: "webhooks",
    title: "Webhooks",
    description: "Receive real-time notifications via HTTP callbacks.",
    group: "reference",
  },
];

export const GROUP_LABELS: Record<DocGroup, string> = {
  "getting-started": "Getting Started",
  guides: "Guides",
  reference: "Reference",
};

export const DOC_SLUGS: DocSlug[] = DOC_DEFINITIONS.map((d) => d.slug);

export function getDocs() {
  return DOC_DEFINITIONS;
}

export function getDocsByGroup(): { label: string; items: DocDefinition[] }[] {
  const groups: DocGroup[] = ["getting-started", "guides", "reference"];
  return groups.map((group) => ({
    label: GROUP_LABELS[group],
    items: DOC_DEFINITIONS.filter((d) => d.group === group),
  }));
}

function slugifyHeading(text: string, counts: Map<string, number>): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/<[^>]*>/g, "")
    .replace(/[`*_~]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const safeBase = base || "section";
  const currentCount = counts.get(safeBase) ?? 0;
  counts.set(safeBase, currentCount + 1);
  return currentCount === 0 ? safeBase : `${safeBase}-${currentCount}`;
}

function extractHeadings(markdown: string): TocHeading[] {
  const headings: TocHeading[] = [];
  const lines = markdown.split("\n");
  const counts = new Map<string, number>();
  let inCodeFence = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (!match) continue;

    const level = match[1].length as 2 | 3;
    const text = match[2].trim();
    const id = slugifyHeading(text, counts);
    headings.push({ id, text, level });
  }

  return headings;
}

function readContentFile(slug: string): string {
  const contentPath = path.join(process.cwd(), "content", "docs", `${slug}.md`);
  return fs.readFileSync(contentPath, "utf-8");
}

export function getDocContent(slug: string): {
  title: string;
  description: string;
  content: string;
  headings: TocHeading[];
} {
  const definition = DOC_DEFINITIONS.find((doc) => doc.slug === slug);
  if (!definition) {
    throw new Error(`Unknown docs slug: ${slug}`);
  }

  const content = readContentFile(slug);
  const headings = extractHeadings(content);

  return {
    title: definition.title,
    description: definition.description,
    content,
    headings,
  };
}

export function getDocNeighbors(slug: string): {
  previous: { href: string; title: string } | null;
  next: { href: string; title: string } | null;
} {
  const idx = DOC_DEFINITIONS.findIndex((d) => d.slug === slug);
  if (idx === -1) return { previous: null, next: null };

  const prev = idx > 0 ? DOC_DEFINITIONS[idx - 1] : null;
  const next = idx < DOC_DEFINITIONS.length - 1 ? DOC_DEFINITIONS[idx + 1] : null;

  return {
    previous: prev ? { href: `/docs/${prev.slug}`, title: prev.title } : null,
    next: next ? { href: `/docs/${next.slug}`, title: next.title } : null,
  };
}
