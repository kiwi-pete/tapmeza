/** Shown instantly while the session and venue are checked. */
export default function StaffLoading() {
  return (
    <div role="status" aria-label="Loading orders" className="min-h-dvh bg-fill dark:bg-canvas">
      <div className="h-14 border-b border-line bg-surface" />
      <div className="grid animate-pulse gap-4 p-4 lg:grid-cols-3">
        {[0, 1, 2].map((column) => (
          <div key={column} className="h-40 rounded-2xl bg-line/60" />
        ))}
      </div>
    </div>
  );
}
