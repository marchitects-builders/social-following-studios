import fs from 'node:fs'
import path from 'node:path'
import Link from 'next/link'
import { CalendarDays, Phone } from 'lucide-react'
import { BUSINESS } from '@/lib/business'
import { VehicleArt } from '@/components/vehicle-art'

const HERO_PHOTO = '/images/hero.jpg'

/**
 * Drop a landscape photograph at public/images/hero.jpg and the hero renders it
 * behind the copy with the navy scrim already tuned for white type. With no file
 * present the hero composes itself from the brand instead of framing a hole.
 */
function heroPhotoExists() {
  try {
    return fs.existsSync(path.join(process.cwd(), 'public', 'images', 'hero.jpg'))
  } catch {
    return false
  }
}

export function Hero() {
  const hasPhoto = heroPhotoExists()

  return (
    <section className="relative overflow-hidden bg-navy-950">
      {hasPhoto ? (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${HERO_PHOTO})` }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 bg-gradient-to-r from-navy-950 via-navy-950/85 to-navy-950/20"
            aria-hidden="true"
          />
        </>
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(120% 90% at 78% 12%, oklch(0.4 0.072 258 / 0.85), transparent 62%), radial-gradient(70% 80% at 4% 96%, oklch(0.742 0.114 82 / 0.16), transparent 60%)',
            }}
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -right-20 bottom-4 hidden w-[46rem] opacity-[0.16] lg:block xl:-right-8 xl:w-[54rem]"
            aria-hidden="true"
          >
            <VehicleArt shape="fullsize" className="w-full" />
          </div>
        </>
      )}

      <div className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
        <div className="max-w-2xl">
          <p className="label-caps flex items-center gap-3 text-gold-500">
            <span className="h-px w-8 bg-gold-500" aria-hidden="true" />
            Family owned since {BUSINESS.founded}
          </p>

          <h1 className="mt-6 font-display text-[2.9rem] leading-[1.03] text-white sm:text-6xl lg:text-7xl">
            New Orleans
            <br />
            Car Rentals
          </h1>

          <p className="mt-6 max-w-lg text-lg font-semibold uppercase leading-snug tracking-[0.03em] text-gold-500 sm:text-xl">
            Personal service. Competitive prices. Delivery where you need us.
          </p>

          <p className="mt-5 max-w-md text-base leading-relaxed text-white/75">
            We make renting a car easy, with airport delivery, hotel drop off, and friendly
            local service from the family that has run this lot since {BUSINESS.founded}.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/reserve"
              className="inline-flex items-center justify-center gap-2.5 rounded-md bg-gold-500 px-7 py-4 text-sm font-bold uppercase tracking-[0.08em] text-navy-950 transition-colors hover:bg-gold-400"
            >
              <CalendarDays className="size-[18px]" aria-hidden="true" />
              Request Your Car
            </Link>
            <a
              href={BUSINESS.phoneHref}
              className="inline-flex items-center justify-center gap-2.5 rounded-md border border-white/30 px-7 py-4 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              <Phone className="size-[18px]" aria-hidden="true" />
              {BUSINESS.phoneDisplay}
            </a>
          </div>

          <p className="mt-4 text-sm text-white/60">Quick. Easy. No phone call needed.</p>
        </div>
      </div>
    </section>
  )
}
