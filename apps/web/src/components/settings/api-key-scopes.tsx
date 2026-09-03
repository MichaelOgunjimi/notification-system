import type { ApiKeyScope } from "@beaco/control-plane";
import "./api-key-scopes.css";

/** The 17 API key scopes grouped by the resource they act on. */
export const SCOPE_GROUPS: ReadonlyArray<{ label: string; scopes: readonly ApiKeyScope[] }> = [
  { label: "Events", scopes: ["events:read", "events:write"] },
  { label: "Templates", scopes: ["templates:read", "templates:write"] },
  { label: "Notifications", scopes: ["notifications:read"] },
  { label: "Scheduled events", scopes: ["scheduled_events:read", "scheduled_events:write"] },
  { label: "Suppressions", scopes: ["suppressions:read", "suppressions:write"] },
  { label: "Alerts", scopes: ["alerts:read", "alerts:write"] },
  { label: "Analytics", scopes: ["analytics:read"] },
  { label: "Dead letters", scopes: ["dead_letters:read", "dead_letters:write"] },
  { label: "Usage", scopes: ["usage:read"] },
  { label: "Audit", scopes: ["audit:read"] },
  { label: "Settings", scopes: ["settings:read"] },
];

/** The action half of a scope (`events:read` → `read`). */
export function scopeAction(scope: ApiKeyScope): string {
  return scope.split(":")[1] ?? scope;
}

/**
 * A checkbox grid for selecting API key scopes, grouped by resource.
 *
 * @param props Selected scopes and a per-scope toggle handler.
 * @returns The scope selection grid.
 */
export function ScopeGrid({
  value,
  onToggle,
}: {
  value: ReadonlySet<ApiKeyScope>;
  onToggle: (scope: ApiKeyScope) => void;
}) {
  return (
    <div className="scope-grid">
      {SCOPE_GROUPS.map((group) => (
        <div key={group.label} className="scope-grid__group">
          <p>{group.label}</p>
          {group.scopes.map((scope) => (
            <label key={scope}>
              <input type="checkbox" checked={value.has(scope)} onChange={() => onToggle(scope)} />
              {scopeAction(scope)}
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}
