import { SpinnerGap } from "@phosphor-icons/react/dist/ssr";
import "./full-page-loading.css";

/**
 * Full-viewport loading surface shared by route transitions and client-side
 * scope resolution so the handoff between them is visually seamless.
 *
 * @param props Short status label announced to assistive technology.
 * @returns Centered spinner with a monospace status label.
 */
export function FullPageLoading({ label }: { label: string }) {
  return (
    <main className="full-page-loading" aria-live="polite">
      <SpinnerGap size={18} className="animate-spin" />
      {label}
    </main>
  );
}
