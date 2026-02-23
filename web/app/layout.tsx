import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import './globals.css'
import { cn } from '@/lib/utils'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AskKaya Admin Dashboard',
  description: 'Admin dashboard for AskKaya client support platform',
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/clients', label: 'Clients', icon: '👥' },
  { href: '/kb', label: 'Knowledge Base', icon: '📚' },
  { href: '/escalations', label: 'Escalations', icon: '🚨' },
  { href: '/analytics', label: 'Analytics', icon: '📈' },
]

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={cn(inter.className, 'bg-background text-foreground')}>
        <div className="min-h-screen flex">
          {/* Sidebar */}
          <aside className="w-64 border-r bg-card hidden md:block">
            <div className="p-6">
              <h1 className="text-xl font-bold">AskKaya</h1>
              <p className="text-sm text-muted-foreground">Admin Dashboard</p>
            </div>
            <nav className="px-3">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <span>{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>

          {/* Mobile header */}
          <div className="flex-1 flex flex-col">
            <header className="md:hidden border-b bg-card p-4">
              <div className="flex items-center justify-between">
                <h1 className="text-lg font-bold">AskKaya</h1>
                <nav className="flex gap-2">
                  {navItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="text-lg"
                      title={item.label}
                    >
                      {item.icon}
                    </Link>
                  ))}
                </nav>
              </div>
            </header>

            {/* Main content */}
            <main className="flex-1 p-6">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  )
}
