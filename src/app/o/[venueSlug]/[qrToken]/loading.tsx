/** Shown instantly while the menu loads, so a slow connection never looks like a dead page. */
export default function MenuLoading() {
  return (
    <div role="status" aria-label="Loading menu" className="mx-auto max-w-xl animate-pulse px-4 pt-5">
      <div className="h-7 w-48 rounded-md bg-fill" />
      <div className="mt-2 h-5 w-20 rounded-md bg-fill" />
      <div className="mt-6 flex gap-4 border-b border-line pb-3">
        <div className="h-5 w-16 rounded-md bg-fill" />
        <div className="h-5 w-14 rounded-md bg-fill" />
        <div className="h-5 w-20 rounded-md bg-fill" />
      </div>
      <ul className="divide-y divide-line">
        {[0, 1, 2, 3, 4].map((row) => (
          <li key={row} className="py-4">
            <div className="h-5 w-40 rounded-md bg-fill" />
            <div className="mt-2 h-4 w-full rounded-md bg-fill" />
            <div className="mt-3 flex items-center justify-between">
              <div className="h-5 w-24 rounded-md bg-fill" />
              <div className="size-11 rounded-full bg-fill" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
