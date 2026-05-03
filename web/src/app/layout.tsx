import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Signal | Personalized News',
  description: 'Curated news articles matching your unique interests, powered by AI.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <nav style={{ padding: '1.5rem 0', borderBottom: '1px solid var(--surface-border)', position: 'sticky', top: 0, zIndex: 100, background: 'rgba(10, 10, 10, 0.8)', backdropFilter: 'blur(12px)' }}>
          <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <a href="/" style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
              Signal<span style={{ color: 'var(--primary)' }}>.</span>
            </a>
            <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.9rem', fontWeight: 500 }}>
              <a href="/feed" className="nav-link">Feed</a>
              <a href="/profile" className="nav-link">Profile</a>
            </div>
          </div>
        </nav>
        <main className="main-content">
          {children}
        </main>
      </body>
    </html>
  )
}
