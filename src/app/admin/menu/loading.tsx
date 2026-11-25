/** Shown instantly while the menu loads. */
export default function AdminMenuLoading() {
  return (
    <div role="status" aria-label="Loading menu">
      <div className="h-14 border-b border-line bg-surface" />
      <div className="mx-auto max-w-3xl animate-pulse px-4 pt-6">
        <div className="h-8 w-28 rounded-md bg-fill" />
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="mt-5 h-12 rounded-xl bg-fill" />
        ))}
      </div>
    </div>
  );
}
