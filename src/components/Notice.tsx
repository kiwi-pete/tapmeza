interface NoticeProps {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}

/** Full-screen message: one headline, one optional line, one optional action. */
export default function Notice({ title, children, action }: NoticeProps) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-xl font-bold">{title}</h1>
      {children && <p className="text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </main>
  );
}
