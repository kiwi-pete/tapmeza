/** Shown instantly after "Place order" while the status screen loads. */
export default function OrderLoading() {
  return (
    <div role="status" aria-label="Loading your order" className="mx-auto max-w-xl animate-pulse px-4 pt-5">
      <div className="h-5 w-40 rounded-md bg-fill" />
      <div className="mt-10 size-16 rounded-full bg-fill" />
      <div className="mt-4 h-8 w-56 rounded-md bg-fill" />
      <div className="mt-2 h-5 w-32 rounded-md bg-fill" />
      <div className="mt-6 grid grid-cols-4 gap-1.5">
        {[0, 1, 2, 3].map((step) => (
          <div key={step} className="h-1.5 rounded-full bg-fill" />
        ))}
      </div>
    </div>
  );
}
