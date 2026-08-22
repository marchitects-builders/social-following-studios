import fs from 'node:fs'
import path from 'node:path'
import Link from 'next/link'
import { ArrowRight, Briefcase, Cog, Users } from 'lucide-react'
import { FLEET } from '@/lib/business'
import { VehicleArt, type Shape } from '@/components/vehicle-art'

function photoExists(publicPath: string) {
  try {
    return fs.existsSync(path.join(process.cwd(), 'public', publicPath))
  } catch {
    return false
  }
}

function Spec({ icon: Icon, label }: { icon: typeof Users; label: string }) {
  return (
    <li className="flex items-center gap-1.5 text-[0.78rem] font-medium text-muted-foreground">
      <Icon className="size-[15px] text-gold-600" aria-hidden="true" />
      {label}
    </li>
  )
}

export function FleetSection() {
  return (
    <section className="bg-white py-20 lg:py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="text-center">
          <h2 className="font-display text-4xl text-navy-900 lg:text-[2.75rem]">Our Fleet</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Clean, reliable vehicles for every trip.
          </p>
          <span className="mx-auto mt-6 block h-px w-16 bg-gold-500" aria-hidden="true" />
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FLEET.map((vehicle) => {
            const hasPhoto = photoExists(vehicle.photo)
            return (
              <article
                key={vehicle.id}
                className="group flex flex-col rounded-lg border border-border bg-white transition-shadow hover:shadow-[0_18px_44px_-18px_oklch(0.26_0.062_259_/_0.35)]"
              >
                <h3 className="label-caps px-5 pt-6 text-center text-navy-900 tracking-[0.16em] text-[0.82rem]">
                  {vehicle.name}
                </h3>

                <div className="flex min-h-[164px] items-center justify-center overflow-hidden px-2 py-3">
                  {hasPhoto ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={vehicle.photo}
                      alt={`${vehicle.name} rental car`}
                      className="h-[150px] w-full object-contain"
                    />
                  ) : (
                    <VehicleArt
                      shape={vehicle.id as Shape}
                      className="w-[124%] max-w-none shrink-0"
                    />
                  )}
                </div>

                <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-border px-4 py-4">
                  <Spec icon={Users} label={vehicle.seats} />
                  <Spec icon={Briefcase} label={vehicle.luggage} />
                  <Spec icon={Cog} label={vehicle.transmission} />
                </ul>

                <div className="mt-auto border-t border-border px-5 py-4 text-center">
                  <Link
                    href={`/reserve?class=${vehicle.id}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-navy-800 transition-colors hover:text-gold-600"
                  >
                    View Vehicles
                    <ArrowRight
                      className="size-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
