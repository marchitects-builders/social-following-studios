import Link from 'next/link'
import { BUSINESS } from '@/lib/business'

/**
 * Typographic wordmark. No emblem.
 *
 * The name carries the mark on its own: a high contrast serif set in small caps
 * over a gold rule and the gold Rent-A-Car line. Reads as a rental company that
 * has been on Broad Street since 2001 rather than a stock badge.
 */
export function Wordmark({
  onDark = false,
  className = '',
}: {
  onDark?: boolean
  className?: string
}) {
  return (
    <Link
      href="/"
      aria-label={`${BUSINESS.name} home`}
      className={`group inline-flex flex-col leading-none ${className}`}
    >
      <span
        className={`font-display text-[1.35rem] sm:text-[1.6rem] font-medium tracking-[0.01em] ${
          onDark ? 'text-white' : 'text-navy-900'
        }`}
        style={{ fontVariantCaps: 'small-caps' }}
      >
        {BUSINESS.wordmark}
      </span>
      <span className="mt-1.5 flex items-center gap-2">
        <span className="h-px w-5 bg-gold-500" aria-hidden="true" />
        <span className="label-caps text-gold-500 tracking-[0.28em] text-[0.6rem] sm:text-[0.68rem]">
          {BUSINESS.subMark}
        </span>
      </span>
    </Link>
  )
}
