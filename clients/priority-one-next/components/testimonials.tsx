'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Quote, Star } from 'lucide-react'

/**
 * REVIEW: placeholder quotes.
 *
 * These hold the section and show the shape. James approves them or supplies quotes
 * from his own customers. No Yelp or Google review text appears here.
 */
const QUOTES = [
  [
    {
      quote:
        'Picked us up at the airport on time and the car was clean and ready to go. Great service and friendly people.',
      name: 'Customer name',
      detail: 'Airport delivery',
    },
    {
      quote:
        'Best rental experience in New Orleans. Delivered to our hotel in the French Quarter and picked it up at checkout.',
      name: 'Customer name',
      detail: 'Hotel delivery',
    },
    {
      quote:
        'Family owned, honest, and easy to work with. The service was personal from the first phone call.',
      name: 'Customer name',
      detail: 'Repeat customer',
    },
  ],
  [
    {
      quote:
        'They tracked my flight when it ran late and were still waiting with the keys when I landed.',
      name: 'Customer name',
      detail: 'Airport delivery',
    },
    {
      quote:
        'I called on a Friday for a car the next morning and a real person picked up and sorted it.',
      name: 'Customer name',
      detail: 'Same week booking',
    },
    {
      quote:
        'Same family every trip I take to New Orleans. They remember my name and what I drive.',
      name: 'Customer name',
      detail: 'Repeat customer',
    },
  ],
]

export function Testimonials() {
  const [page, setPage] = useState(0)
  const slides = QUOTES[page]

  return (
    <section className="bg-cream py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="text-center">
          <h2 className="font-display text-4xl text-navy-900 lg:text-[2.75rem]">
            What Our Customers Say
          </h2>
          <span className="mx-auto mt-6 block h-px w-16 bg-gold-500" aria-hidden="true" />
        </div>

        <div className="mt-12 flex items-center gap-4 lg:gap-8">
          <button
            type="button"
            onClick={() => setPage((p) => (p === 0 ? QUOTES.length - 1 : p - 1))}
            aria-label="Previous testimonials"
            className="hidden size-11 shrink-0 items-center justify-center rounded-full border border-navy-900/20 text-navy-900 transition-colors hover:border-gold-500 hover:text-gold-600 sm:flex"
          >
            <ChevronLeft className="size-5" />
          </button>

          <ul className="grid flex-1 gap-8 md:grid-cols-3 md:divide-x md:divide-navy-900/10">
            {slides.map((item, i) => (
              <li key={i} className="px-2 text-center md:px-6">
                <Quote
                  className="mx-auto size-6 rotate-180 text-gold-400"
                  aria-hidden="true"
                />
                <blockquote className="mt-4 text-[0.95rem] italic leading-relaxed text-navy-900/85">
                  {item.quote}
                </blockquote>
                <div
                  className="mt-5 flex justify-center gap-1"
                  role="img"
                  aria-label="Five out of five"
                >
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} className="size-4 fill-gold-500 text-gold-500" />
                  ))}
                </div>
                <p className="mt-4 text-sm font-semibold text-navy-900">
                  {item.name}
                  <span className="ml-1 font-normal text-muted-foreground">
                    {item.detail}
                  </span>
                </p>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setPage((p) => (p + 1) % QUOTES.length)}
            aria-label="Next testimonials"
            className="hidden size-11 shrink-0 items-center justify-center rounded-full border border-navy-900/20 text-navy-900 transition-colors hover:border-gold-500 hover:text-gold-600 sm:flex"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>

        <div className="mt-10 flex justify-center gap-2.5">
          {QUOTES.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPage(i)}
              aria-label={`Testimonial set ${i + 1}`}
              aria-current={page === i}
              className={`size-2.5 rounded-full transition-colors ${
                page === i ? 'bg-navy-900' : 'bg-navy-900/25 hover:bg-navy-900/50'
              }`}
            />
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-2xl rounded-md border border-gold-200 bg-gold-200/40 px-5 py-3 text-center text-sm text-navy-900/80">
          <strong className="font-semibold">For review:</strong> placeholder quotes. Send
          approved customer words and they swap in the same day.
        </p>
      </div>
    </section>
  )
}
