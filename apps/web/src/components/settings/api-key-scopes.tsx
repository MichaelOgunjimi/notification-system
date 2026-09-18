import type { ApiKeyScope } from "@beaco/control-plane";
import "./api-key-scopes.css";

/** The 15 API key scopes grouped by the resource they act on. */
export const SCOPE_GROUPS: ReadonlyArray<{ label: string; scopes: readonly ApiKeyScope[] }> = [
  { label: "Events", scopes: ["events:read", "events:write"] },
  { label: "Templates", scopes: ["templates:read", "templates:write"] },
  { label: "Notifications", scopes: ["notifications:read"] },
  { label: "Scheduled events", scopes: ["scheduled_events:read", "scheduled_events:write"] },
  { label: "Suppressions", scopes: ["suppressions:read", "suppressions:write"] },
  { label: "Analytics", scopes: ["analytics:read"] },
  { label: "Dead letters", scopes: ["dead_letters:read", "dead_letters:write"] },
  { label: "Usage", scopes: ["usage:read"] },
  { label: "Audit", scopes: ["audit:read"] },
  { label: "Settings", scopes: ["settings:read"] },
];

/** Every API-key scope supported by the notification API. */
export const ALL_API_KEY_SCOPES: readonly ApiKeyScope[] = SCOPE_GROUPS.flatMap(
  (group) => group.scopes,
);

/** Every non-mutating API-key scope supported by the notification API. */
export const READ_ONLY_API_KEY_SCOPES: readonly ApiKeyScope[] = ALL_API_KEY_SCOPES.filter((scope) =>
  scope.endsWith(":read"),
);

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
  onChange,
}: {
  value: ReadonlySet<ApiKeyScope>;
  onChange: (scopes: ReadonlySet<ApiKeyScope>) => void;
}) {
  function replaceScopes(scopes: readonly ApiKeyScope[]) {
    onChange(new Set(scopes));
  }

  function toggleScope(scope: ApiKeyScope) {
    const next = new Set(value);
    if (next.has(scope)) next.delete(scope);
    else next.add(scope);
    onChange(next);
  }

  const readOnlySelected =
    value.size === READ_ONLY_API_KEY_SCOPES.length &&
    READ_ONLY_API_KEY_SCOPES.every((scope) => value.has(scope));
  const allSelected =
    value.size === ALL_API_KEY_SCOPES.length &&
    ALL_API_KEY_SCOPES.every((scope) => value.has(scope));

  return (
    <div className="scope-picker">
      <div className="scope-picker__presets" aria-label="Scope presets">
        <span>Quick select</span>
        <button
          type="button"
          aria-pressed={readOnlySelected}
          data-active={readOnlySelected || undefined}
          onClick={() => replaceScopes(READ_ONLY_API_KEY_SCOPES)}
        >
          Read only
        </button>
        <button
          type="button"
          aria-pressed={allSelected}
          data-active={allSelected || undefined}
          onClick={() => replaceScopes(ALL_API_KEY_SCOPES)}
        >
          All scopes
        </button>
        {value.size > 0 ? (
          <button type="button" className="scope-picker__clear" onClick={() => replaceScopes([])}>
            Clear
          </button>
        ) : null}
      </div>

      <div className="scope-grid">
        {SCOPE_GROUPS.map((group) => (
          <div key={group.label} className="scope-grid__group">
            <p>{group.label}</p>
            {group.scopes.map((scope) => (
              <label key={scope}>
                <input
                  type="checkbox"
                  checked={value.has(scope)}
                  onChange={() => toggleScope(scope)}
                />
                {scopeAction(scope)}
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
