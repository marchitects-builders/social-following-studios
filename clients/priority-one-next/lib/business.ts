/**
 * A Priority One Rent-A-Car. Business facts and site content.
 *
 * Every fact the client would correct lives here. Items marked REVIEW await
 * confirmation from James Washington.
 */

export const BUSINESS = {
  name: 'A Priority One Rent-A-Car',
  wordmark: 'A Priority One',
  subMark: 'Rent-A-Car',
  founded: 2001,
  owner: 'James Washington',
  street: '209 S Broad St',
  city: 'New Orleans',
  state: 'LA',
  zip: '70119',
  phoneDisplay: '(504) 827-2900',
  phoneHref: 'tel:+15048272900',
  mapQuery: '209 S Broad St, New Orleans, LA 70119',
} as const

export const NAV = [
  { label: 'Home', href: '/' },
  { label: 'Our Vehicles', href: '/vehicles' },
  { label: 'Reserve', href: '/reserve' },
  { label: 'About', href: '/about' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Contact', href: '/contact' },
] as const

/** REVIEW: hours stand in for the real schedule. */
export const HOURS = [
  { days: 'Monday to Friday', time: '7:00 AM to 7:00 PM' },
  { days: 'Saturday', time: '8:00 AM to 5:00 PM' },
  { days: 'Sunday', time: '9:00 AM to 4:00 PM' },
] as const

/**
 * Fleet classes.
 *
 * `photo` points at a file in /public/images/fleet. The reference design cuts each
 * vehicle out against white, so supply cutouts or clean white background shots.
 *
 * REVIEW: example models describe each class. Confirm against the real fleet.
 */
export const FLEET = [
  {
    id: 'compact',
    name: 'Compact',
    photo: '/images/fleet/compact.png',
    tagline: 'The Quarter parking special',
    body: 'Narrow streets and tight curb space suit this one, and it burns the least fuel on the lot.',
    seats: '5 Seats',
    luggage: '2 Luggage',
    transmission: 'Automatic',
    models: 'Nissan Versa or a similar compact',
  },
  {
    id: 'midsize',
    name: 'Mid-Size',
    photo: '/images/fleet/midsize.png',
    tagline: 'The everyday pick',
    body: 'Room for four adults with luggage and a ride that stays comfortable on the interstate.',
    seats: '5 Seats',
    luggage: '2 Luggage',
    transmission: 'Automatic',
    models: 'Toyota Corolla or a similar midsize sedan',
  },
  {
    id: 'fullsize',
    name: 'Full-Size',
    photo: '/images/fleet/fullsize.png',
    tagline: 'Long drives and business travel',
    body: 'A bigger trunk and the legroom that makes a Gulf Coast run feel short.',
    seats: '5 Seats',
    luggage: '3 Luggage',
    transmission: 'Automatic',
    models: 'Toyota Camry or a similar full-size sedan',
  },
  {
    id: 'suv',
    name: 'SUV',
    photo: '/images/fleet/suv.png',
    tagline: 'Families and gear',
    body: 'High seating and the cargo room a family reunion weekend calls for.',
    seats: '7 Seats',
    luggage: '3 Luggage',
    transmission: 'Automatic',
    models: 'Toyota RAV4 or a similar SUV',
  },
] as const
