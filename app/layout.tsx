// app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Camera Preview App',
  description: 'Next.js Camera Interface',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className={inter.className}>
        <main className="min-h-screen p-8 flex flex-col items-center justify-center">
          {children}
        </main>
      </body>
    </html>
  );
}
