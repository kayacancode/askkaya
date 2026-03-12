import type { Metadata } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['300', '400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'AskKaya - Build Your Digital Twin',
  description: 'Create your own Ask[Name] — a digital twin that thinks like you, knows what you know, and works while you sleep.',
  keywords: ['digital twin', 'AI clone', 'knowledge base', 'AI assistant'],
  openGraph: {
    title: 'AskKaya - Build Your Digital Twin',
    description: 'Clone yourself. Scale infinitely. Your digital twin works while you sleep.',
    type: 'website',
    url: 'https://askkaya.ai',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={outfit.variable}>
      <body style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}>
        {children}
      </body>
    </html>
  )
}
