import "./loading.css";

/** Returns the immediate loading surface for a dynamic dashboard navigation. */
export default function DashboardLoading() {
  return (
    <main className="dashboard-route-loading" aria-live="polite">
      <span>Resolving project context</span>
    </main>
  );
}
