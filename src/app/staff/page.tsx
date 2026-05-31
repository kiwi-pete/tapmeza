export default function StaffAppPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-brand-sand-light text-brand-charcoal-dark dark:bg-brand-charcoal dark:text-brand-sand-light">
      <main className="max-w-md w-full text-center space-y-4 border border-brand-sand-dark dark:border-brand-charcoal-light p-8 rounded-2xl bg-white dark:bg-brand-charcoal-dark shadow-sm">
        <h1 className="text-3xl font-extrabold tracking-tight text-brand-turquoise">Tapmeza Staff</h1>
        <p className="text-lg font-medium">
          Staff App
        </p>
        <p className="text-sm text-brand-charcoal-light dark:text-brand-sand-dark">
          Real-time tablet orders monitoring and lifecycle progression panel.
        </p>
        <div className="pt-4">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-brand-sand dark:bg-brand-charcoal text-brand-charcoal-dark dark:text-brand-sand-light">
            Staff App Surface
          </span>
        </div>
      </main>
    </div>
  );
}
