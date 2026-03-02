import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AskKaya - Ask Me Anything, Anytime',
  description: "Kaya's digital twin that answers your questions 24/7. It learns from every interaction—if it doesn't know, it asks me.",
  keywords: ['AI', 'support', 'knowledge base', 'MCP', 'Claude', 'digital twin', 'Kaya'],
  authors: [{ name: 'Kaya Jones' }],
  openGraph: {
    title: 'AskKaya - Ask Me Anything, Anytime',
    description: "Kaya's digital twin that answers your questions 24/7. It learns from every interaction.",
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" style={{ background: '#0C0A09' }}>
      <body style={{ margin: 0, padding: 0, background: '#0C0A09', minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  )
}
