import Link from "next/link";
import { ArrowUpRight, CirclesThreePlus } from "@phosphor-icons/react/dist/ssr";
import { ThemeToggle } from "@beaco/theme";
import BrandLogo from "@/components/brand/brand-logo";
import "./workspace-shell.css";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className="workspace-shell min-h-dvh">
      <header className="workspace-shell__header">
        <Link href="/" aria-label="Beaco home">
          <BrandLogo priority markClassName="size-8" labelClassName="text-[15px] font-semibold tracking-[-0.03em]" />
        </Link>
        <span className="workspace-shell__product-label">Control plane</span>
        <nav aria-label="Workspace utility navigation" className="workspace-shell__utilities">
          <Link href="/" className="workspace-shell__link">Site <ArrowUpRight size={13} /></Link>
          <ThemeToggle />
        </nav>
      </header>

      <div className="workspace-shell__frame">
        <aside className="workspace-shell__aside">
          <div>
            <span className="workspace-shell__aside-icon"><CirclesThreePlus size={19} /></span>
            <p className="workspace-shell__kicker">Workspace context</p>
            <h1>Choose the scope for this session.</h1>
            <p className="workspace-shell__aside-copy">Organization membership decides what you can enter. The selected project will scope dashboard data, API keys, and delivery operations.</p>
          </div>
          <div className="workspace-shell__aside-note">
            <span>Protected boundary</span>
            <p>Credentials remain in HTTP-only cookies while this view reads the control plane through the application server.</p>
          </div>
        </aside>

        <section className="workspace-shell__content">{children}</section>
      </div>
    </main>
  );
}
