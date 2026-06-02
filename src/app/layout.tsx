import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 's1ng — karaoke from any YouTube link',
  description: 'Paste a YouTube URL, get karaoke. English, Spanish, romaji for Japanese & Korean.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://rsms.me/inter/inter.css"
        />
      </head>
      <body className="min-h-screen bg-bg text-ink">
        <header className="container-page flex items-center justify-between py-6">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-semibold tracking-tightest">s1ng</span>
            <span className="text-xs uppercase tracking-[0.18em] text-mute">karaoke</span>
          </Link>
          <nav className="text-xs uppercase tracking-[0.18em] text-mute">
            <Link href="/" className="hover:text-ink">library</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="container-page mt-24 py-8 text-xs uppercase tracking-[0.18em] text-mute">
          <div className="hairline pt-8">paste · process · sing</div>
        </footer>
      </body>
    </html>
  );
}
