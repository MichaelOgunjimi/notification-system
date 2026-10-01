"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, Copy } from "@phosphor-icons/react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { docsUrl } from "@/lib/urls";

const SDK_EXAMPLES = [
  {
    id: "typescript",
    name: "TypeScript",
    version: "Node.js 18.17+",
    install: "npm install @beaco/sdk",
    href: "/sdk",
    language: "typescript",
    code: `import { Beaco } from "@beaco/sdk";

const beaco = new Beaco({
  apiKey: process.env.BEACO_API_KEY!,
});

await beaco.events.publish({
  eventType: "user.welcome",
  recipients: [{
    channels: ["email"],
    email: "ada@example.com",
  }],
  payload: { name: "Ada" },
});`,
  },
  {
    id: "python",
    name: "Python",
    version: "Python 3.9+",
    install:
      'uv add "beaco @ git+https://github.com/MichaelOgunjimi/notification-system.git@main#subdirectory=sdks/python"',
    href: "/sdk-python",
    language: "python",
    code: `import os
from beaco import Beaco

beaco = Beaco(os.environ["BEACO_API_KEY"])

beaco.events.publish(
    "user.welcome",
    [{
        "channels": ["email"],
        "email": "ada@example.com",
    }],
    payload={"name": "Ada"},
)`,
  },
  {
    id: "go",
    name: "Go",
    version: "Go 1.22+",
    install: "go get github.com/MichaelOgunjimi/notification-system/sdks/go",
    href: "/sdk-go",
    language: "go",
    code: `client, err := beaco.New(
    os.Getenv("BEACO_API_KEY"), nil,
)
if err != nil { panic(err) }

_, err = client.Events.Publish(ctx,
    beaco.PublishEventInput{
        EventType: "user.welcome",
        Recipients: []beaco.Recipient{{
            Channels: []string{"email"},
            Email: "ada@example.com",
        }},
        Payload: map[string]any{"name": "Ada"},
    },
)`,
  },
] as const;

/** Interactive language picker for the server SDK examples on the landing page. */
export default function SdkPlayground() {
  const [activeId, setActiveId] = useState<(typeof SDK_EXAMPLES)[number]["id"]>("typescript");
  const [copied, setCopied] = useState(false);
  const active = SDK_EXAMPLES.find((example) => example.id === activeId) ?? SDK_EXAMPLES[0];

  async function copyInstallCommand() {
    await navigator.clipboard.writeText(active.install);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="sdk-workspace">
      <div className="sdk-editor">
        <div className="sdk-tabs" role="tablist" aria-label="SDK language">
          {SDK_EXAMPLES.map((example) => (
            <button
              key={example.id}
              type="button"
              role="tab"
              aria-selected={active.id === example.id}
              aria-controls="sdk-code-panel"
              onClick={() => {
                setActiveId(example.id);
                setCopied(false);
              }}
              className="sdk-tab"
            >
              <span>{example.name}</span>
              <span className="sdk-tab-version">{example.version}</span>
            </button>
          ))}
        </div>

        <div id="sdk-code-panel" role="tabpanel" className="sdk-code-panel">
          <div className="sdk-install-row">
            <span className="sdk-prompt" aria-hidden="true">
              $
            </span>
            <code>{active.install}</code>
            <button type="button" onClick={copyInstallCommand} className="sdk-copy-button">
              {copied ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Copy size={14} aria-hidden="true" />
              )}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
          <SyntaxHighlighter
            language={active.language}
            style={oneDark}
            className="sdk-code"
            customStyle={{ margin: 0, background: "transparent" }}
            codeTagProps={{
              style: { fontFamily: "var(--font-geist-mono), ui-monospace, monospace" },
            }}
          >
            {active.code}
          </SyntaxHighlighter>
        </div>
      </div>

      <aside className="sdk-delivery-panel" aria-label="Example delivery trace">
        <div className="sdk-delivery-heading">
          <div>
            <p className="sdk-eyebrow">Live delivery trace</p>
            <p className="sdk-event-id">evt_01J9BEACO</p>
          </div>
          <span className="sdk-live-status">
            <span aria-hidden="true" /> Delivered
          </span>
        </div>

        <div className="sdk-trace" aria-label="Accepted, queued, and delivered">
          {[
            ["Accepted", "0 ms"],
            ["Queued", "18 ms"],
            ["Delivered", "284 ms"],
          ].map(([label, duration], index) => (
            <div key={label} className="sdk-trace-step">
              <span className="sdk-trace-marker">{index + 1}</span>
              <div>
                <p>{label}</p>
                <span>{duration}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="sdk-payload">
          <span>event</span>
          <code>user.welcome</code>
          <span>channel</span>
          <code>email</code>
          <span>recipient</span>
          <code>ada@example.com</code>
        </div>

        <Link href={docsUrl(active.href)} className="sdk-docs-link">
          Read the {active.name} guide
          <ArrowRight size={14} weight="bold" aria-hidden="true" />
        </Link>
      </aside>
    </div>
  );
}
