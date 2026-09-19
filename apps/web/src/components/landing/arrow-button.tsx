import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";

/** Primary marketing CTA: label plus a trailing arrow that nudges forward on hover. */
export default function ArrowButton({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <span className={`site-primary-action ${className}`}>
      <span>{label}</span>
      <span className="site-primary-action-icon">
        <ArrowRight size={14} weight="bold" aria-hidden="true" />
      </span>
    </span>
  );
}
