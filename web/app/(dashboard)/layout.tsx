'use client'

import { Inter } from 'next/font/google'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const inter = Inter({ subsets: ['latin'] })

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/clients', label: 'Clients', icon: '👥' },
  { href: '/kb', label: 'Knowledge Base', icon: '📚' },
  { href: '/escalations', label: 'Escalations', icon: '🚨' },
  { href: '/analytics', label: 'Analytics', icon: '📈' },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className={cn(inter.className, 'bg-background text-foreground min-h-screen flex')}>
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card hidden md:block">
        <div className="p-6">
          <Link href="/" className="block">
            <h1 className="text-xl font-bold">AskKaya</h1>
            <p className="text-sm text-muted-foreground">Admin Dashboard</p>
          </Link>
        </div>
        <nav className="px-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                pathname === item.href || pathname?.startsWith(item.href + '/')
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground"
              )}
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
            <Link href="/">
              <h1 className="text-lg font-bold">AskKaya</h1>
            </Link>
            <nav className="flex gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "text-lg",
                    pathname === item.href || pathname?.startsWith(item.href + '/')
                      ? "opacity-100"
                      : "opacity-50"
                  )}
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
  )
}
