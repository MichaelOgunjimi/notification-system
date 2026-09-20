import type { CSSProperties } from "react";
import "./skeleton.css";

/** Props for the shared layout-matched loading bone. */
type SkeletonProps = Readonly<{
  className?: string;
  style?: CSSProperties;
}>;

/**
 * Renders a decorative loading bone using the active surface's theme tokens.
 *
 * @param props Optional geometry classes and inline dimensions.
 * @returns An inaccessible shimmer placeholder.
 */
export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={className ? `skeleton ${className}` : "skeleton"}
      style={style}
    />
  );
}
