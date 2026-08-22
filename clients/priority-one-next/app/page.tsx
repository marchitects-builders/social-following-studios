import { Hero } from '@/components/hero'
import { FleetSection } from '@/components/fleet-section'
import { DeliverySection } from '@/components/delivery-section'
import { Testimonials } from '@/components/testimonials'

export default function HomePage() {
  return (
    <>
      <Hero />
      <FleetSection />
      <DeliverySection />
      <Testimonials />
    </>
  )
}
