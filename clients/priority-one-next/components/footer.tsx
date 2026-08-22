import Link from 'next/link'
import { MapPin, Phone } from 'lucide-react'
import { BUSINESS, HOURS, NAV } from '@/lib/business'
import { Wordmark } from '@/components/wordmark'

export function Footer() {
  const mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    BUSINESS.mapQuery,
  )}`

  return (
    <footer className="bg-navy-950 text-white/70">
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr_1.3fr_0.7fr]">
          <div>
            <Wordmark onDark />
            <p className="mt-5 max-w-[30ch] text-sm leading-relaxed">
              Family owned and operated in New Orleans since {BUSINESS.founded}.
            </p>
          </div>

          <div>
            <h2 className="label-caps mb-4 text-gold-500">Contact Us</h2>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href={mapLink}
                  target="_blank"
                  rel="noreferrer"
                  className="flex gap-3 transition-colors hover:text-white"
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-gold-500" aria-hidden="true" />
                  <span>
                    {BUSINESS.street}
                    <br />
                    {BUSINESS.city}, {BUSINESS.state} {BUSINESS.zip}
                  </span>
                </a>
              </li>
              <li>
                <a
                  href={BUSINESS.phoneHref}
                  className="flex items-center gap-3 transition-colors hover:text-white"
                >
                  <Phone className="size-4 shrink-0 text-gold-500" aria-hidden="true" />
                  {BUSINESS.phoneDisplay}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="label-caps mb-4 text-gold-500">Hours</h2>
            <ul className="space-y-2 text-sm">
              {HOURS.map((row) => (
                <li key={row.days} className="flex justify-between gap-4">
                  <span className="whitespace-nowrap">{row.days}</span>
                  <span className="text-white">{row.time}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm">
              We are happy to accommodate pickup outside these hours by appointment.
            </p>
          </div>

          <div>
            <h2 className="label-caps mb-4 text-gold-500">Pages</h2>
            <ul className="space-y-3 text-sm">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="transition-colors hover:text-white">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-gold-500">
        <p className="mx-auto max-w-7xl px-5 py-3 text-center text-xs font-medium text-navy-950 sm:px-8">
          &copy; {new Date().getFullYear()} {BUSINESS.name}. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
