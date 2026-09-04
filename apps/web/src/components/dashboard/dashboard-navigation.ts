import type { Icon } from "@phosphor-icons/react";
import {
  Broadcast,
  Buildings,
  Code,
  FolderSimple,
  Key,
  ListBullets,
  PaperPlaneTilt,
  Pulse,
  SquaresFour,
} from "@phosphor-icons/react";
import type { OrganizationCapability } from "@beaco/control-plane";

/**
 * One dashboard navigation destination.
 *
 * @property label Human-readable navigation label.
 * @property icon Phosphor icon component rendered beside the label.
 * @property path Route path relative to the active project root (empty for the root overview).
 * @property capability Organization capability required to see the item, when gated.
 * @property comingSoon Whether the destination is announced but not yet routable.
 */
export type DashboardNavItem = Readonly<{
  label: string;
  icon: Icon;
  path: string;
  capability?: OrganizationCapability;
  comingSoon?: boolean;
}>;

/** Operational surfaces scoped to the active project. */
export const OPERATE_NAV: readonly DashboardNavItem[] = [
  { label: "Overview", icon: SquaresFour, path: "" },
  { label: "Activity", icon: Broadcast, path: "activity", capability: "project:audit:read" },
  { label: "Events", icon: Pulse, path: "events", comingSoon: true },
  { label: "Templates", icon: Code, path: "templates", comingSoon: true },
  { label: "Delivery", icon: PaperPlaneTilt, path: "delivery", comingSoon: true },
];

/** Configuration surfaces scoped to the active project and its organization. */
export const CONFIGURE_NAV: readonly DashboardNavItem[] = [
  { label: "Project", icon: FolderSimple, path: "settings/project", capability: "project:manage" },
  { label: "Organization", icon: Buildings, path: "settings/organization" },
  {
    label: "API keys",
    icon: Key,
    path: "settings/security",
    capability: "api_key:manage",
  },
  {
    label: "Audit log",
    icon: ListBullets,
    path: "settings/audit",
    capability: "project:audit:read",
  },
];

/**
 * Surfaces that render inside the shell but are reached from the account menu
 * rather than the sidebar navigation. Single source for their path and title.
 */
export const AUXILIARY_ROUTES = {
  accountSettings: { path: "settings/account", title: "Account settings" },
} as const;

const AUXILIARY_TITLES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.values(AUXILIARY_ROUTES).map((route) => [route.path, route.title]),
);

const NAV_TITLES: Readonly<Record<string, string>> = Object.fromEntries(
  [...OPERATE_NAV, ...CONFIGURE_NAV].map((item) => [item.path, item.label]),
);

/**
 * Resolves the stage-header title for a project-relative route suffix.
 *
 * @param suffix Path after the `/app/{org}/{project}` prefix, without a leading slash.
 * @returns Title for the current surface, defaulting to the overview label.
 */
export function stageTitleForSuffix(suffix: string): string {
  return AUXILIARY_TITLES[suffix] ?? NAV_TITLES[suffix] ?? NAV_TITLES[""];
}
