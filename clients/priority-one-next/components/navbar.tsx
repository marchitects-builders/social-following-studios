'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Phone, Menu, X } from 'lucide-react'
import { BUSINESS, NAV } from '@/lib/business'
import { Wordmark } from '@/components/wordmark'

export function Navbar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 bg-navy-950">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 sm:px-8 lg:py-5">
        <Wordmark onDark />

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
          {NAV.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`label-caps border-b-2 pb-1 transition-colors ${
                  active
                    ? 'border-gold-500 text-white'
                    : 'border-transparent text-white/70 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={BUSINESS.phoneHref}
            className="hidden items-center gap-2 rounded-md bg-gold-500 px-5 py-3 text-sm font-semibold text-navy-950 transition-colors hover:bg-gold-400 sm:inline-flex"
          >
            <Phone className="size-4" aria-hidden="true" />
            {BUSINESS.phoneDisplay}
          </a>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="inline-flex size-11 items-center justify-center rounded-md border border-white/25 text-white lg:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Primary"
          className="border-t border-white/10 bg-navy-950 px-5 pb-6 sm:px-8 lg:hidden"
        >
          <ul className="flex flex-col">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={pathname === item.href ? 'page' : undefined}
                  className={`block border-b border-white/10 py-4 text-base font-medium ${
                    pathname === item.href ? 'text-gold-500' : 'text-white/85'
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <a
            href={BUSINESS.phoneHref}
            className="mt-5 flex items-center justify-center gap-2 rounded-md bg-gold-500 px-5 py-3.5 text-sm font-semibold text-navy-950"
          >
            <Phone className="size-4" aria-hidden="true" />
            {BUSINESS.phoneDisplay}
          </a>
        </nav>
      ) : null}
    </header>
  )
}
