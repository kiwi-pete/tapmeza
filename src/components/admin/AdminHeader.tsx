import Link from 'next/link';

export default function AdminHeader({ venueName }: { venueName: string }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface pr-2 pl-4">
      <p className="min-w-0 flex-1 truncate font-semibold">{venueName}</p>
      <Link href="/staff" className="btn btn-secondary min-h-11 px-4 text-sm">
        Orders
      </Link>
    </header>
  );
}
