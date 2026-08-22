import Link from 'next/link'
import { Building2, MapPin, Plane } from 'lucide-react'

const POINTS = [
  {
    icon: Plane,
    title: 'Airport Service',
    body: 'Delivery and pickup at Louis Armstrong New Orleans International Airport.',
  },
  {
    icon: Building2,
    title: 'Hotel Delivery',
    body: 'We deliver to your hotel and collect the car when your trip is complete.',
  },
  {
    icon: MapPin,
    title: 'French Quarter',
    body: 'Convenient delivery and pickup across the Quarter and downtown.',
  },
]

export function DeliverySection() {
  return (
    <section className="bg-navy-900 py-20 text-white/75 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div className="lg:border-r lg:border-white/15 lg:pr-16">
            <h2 className="font-display text-4xl text-white lg:text-[2.6rem]">
              We Deliver. You Enjoy.
            </h2>
            <p className="mt-5 text-base font-semibold uppercase leading-snug tracking-[0.04em] text-gold-500">
              Airport, hotel, and French Quarter delivery and pickup.
            </p>
            <p className="mt-5 max-w-md leading-relaxed">
              We bring your car to you and collect it when you are done. Louis Armstrong
              Airport, your hotel, or anywhere in the New Orleans area. It is that easy.
            </p>
            <Link
              href="/reserve"
              className="mt-8 inline-flex items-center justify-center rounded-md border border-gold-500 px-7 py-3.5 text-sm font-semibold uppercase tracking-[0.08em] text-gold-500 transition-colors hover:bg-gold-500 hover:text-navy-950"
            >
              Learn More
            </Link>
          </div>

          <div>
            <ul className="grid gap-10 sm:grid-cols-3">
              {POINTS.map(({ icon: Icon, title, body }) => (
                <li key={title} className="text-center">
                  <span className="mx-auto flex size-16 items-center justify-center rounded-full border-2 border-gold-500">
                    <Icon className="size-7 text-gold-500" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 font-display text-xl text-gold-500">{title}</h3>
                  <p className="mt-3 text-sm leading-relaxed">{body}</p>
                </li>
              ))}
            </ul>
            <p className="mt-10 text-center text-sm italic text-white/60">
              Service available throughout the New Orleans area.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
