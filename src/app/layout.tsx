import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Tapmeza — Multi-Tenant QR Ordering',
  description: 'QR Ordering for Hotels, Restaurants, and Beach Clubs',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
