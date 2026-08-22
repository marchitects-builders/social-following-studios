/**
 * A Priority One Rent-A-Car. Content and configuration.
 *
 * Every business fact and every piece of copy lives here so
 * the client's real content drops into one file.
 *
 * Items tagged REVIEW are placeholders awaiting confirmation from James Washington.
 * See README.md for the full review checklist.
 */

export const BUSINESS = {
  name: "A Priority One Rent-A-Car",
  shortName: "A Priority One",
  founded: 2001,
  owner: "James Washington",
  street: "209 S Broad St",
  city: "New Orleans",
  state: "LA",
  zip: "70119",
  phoneDisplay: "(504) 827-2900",
  phoneHref: "tel:+15048272900",
  mapQuery: "209 S Broad St, New Orleans, LA 70119",
};

/** REVIEW: hours below stand in for the real schedule. Confirm before launch. */
export const HOURS = [
  { days: "Monday to Friday", time: "8:00 AM to 5:00 PM" },
  { days: "Saturday", time: "9:00 AM to 1:00 PM" },
  { days: "Sunday", time: "By appointment" },
];

/**
 * Reservation request destination.
 *
 * Leave RESERVATION_ENDPOINT empty and the form runs in preview mode: it validates
 * the request and shows the confirmation panel, then hands the visitor a prepared email
 * as a second route. Paste a lead capture URL (Formspree, Zoho Web to Lead, Netlify
 * Forms, or a custom handler) and the same form posts to it.
 *
 * REVIEW: set RESERVATION_INBOX to the address that should receive requests.
 */
export const RESERVATION_ENDPOINT = "";
export const RESERVATION_INBOX = "";

export const NAV = [
  { label: "Home", route: "/" },
  { label: "Our Vehicles", route: "/vehicles" },
  { label: "Reserve", route: "/reserve" },
  { label: "About", route: "/about" },
  { label: "FAQ", route: "/faq" },
  { label: "Contact", route: "/contact" },
];

export const HERO = {
  headline: "Rent Local. Get Where You're Going.",
  subhead:
    "Family owned New Orleans car rentals with convenient pickup and delivery since 2001.",
  cta: "Request Your Car",
};

export const STEPS = [
  {
    number: "01",
    title: "Choose Your Ride",
    body:
      "Pick the class that fits the trip. Four sizes run from compact through SUV.",
  },
  {
    number: "02",
    title: "Tell Us Your Dates",
    body:
      "Send your dates and the address where you want the keys. The form takes about a minute.",
  },
  {
    number: "03",
    title: "We Confirm Your Rental",
    body:
      "Someone from our office calls you back and holds the vehicle for your dates. That call covers the paperwork.",
  },
];

/**
 * Fleet classes.
 *
 * `photo` points at a file in /public/fleet. Drop a real photograph at that path and
 * the card swaps from the studio placeholder to the photograph with no code change.
 * `shape` selects the placeholder profile drawn until the photograph arrives.
 *
 * REVIEW: example models below describe each class. Confirm against the real fleet.
 */
export const FLEET = [
  {
    id: "compact",
    name: "Compact",
    shape: "compact",
    photo: "/fleet/compact.jpg",
    tagline: "The Quarter parking special",
    body:
      "Narrow streets and tight curb space suit this one, and it burns the least fuel on the lot. Solo travelers and couples take it most often.",
    specs: { seats: "5 seats", luggage: "2 suitcases", transmission: "Automatic" },
    features: ["Air conditioning", "Bluetooth audio", "Backup camera"],
    models: "Nissan Versa or a similar compact",
  },
  {
    id: "midsize",
    name: "Midsize",
    shape: "midsize",
    photo: "/fleet/midsize.jpg",
    tagline: "The everyday pick",
    body:
      "Room for four adults with luggage and a ride that stays comfortable on the interstate. Our most requested class.",
    specs: { seats: "5 seats", luggage: "3 suitcases", transmission: "Automatic" },
    features: ["Air conditioning", "Bluetooth audio", "Backup camera"],
    models: "Toyota Corolla or a similar midsize sedan",
  },
  {
    id: "fullsize",
    name: "Full Size",
    shape: "fullsize",
    photo: "/fleet/fullsize.jpg",
    tagline: "Long drives and business travel",
    body:
      "A bigger trunk and the legroom that makes a Gulf Coast run feel short. The cabin stays quiet at interstate speed.",
    specs: { seats: "5 seats", luggage: "4 suitcases", transmission: "Automatic" },
    features: ["Air conditioning", "Bluetooth audio", "Cruise control"],
    models: "Toyota Camry or a similar full-size sedan",
  },
  {
    id: "suv",
    name: "SUV",
    shape: "suv",
    photo: "/fleet/suv.jpg",
    tagline: "Families and gear",
    body:
      "High seating and the cargo room a family reunion weekend calls for. Select vehicles run a third row.",
    specs: { seats: "5 to 7 seats", luggage: "5 suitcases", transmission: "Automatic" },
    features: ["Air conditioning", "Bluetooth audio", "Third row on select vehicles"],
    models: "Toyota RAV4 or a similar SUV",
  },
];

export const DELIVERY = {
  eyebrow: "Pickup and delivery",
  title: "We Bring the Car to You.",
  body:
    "Most of our customers land at Louis Armstrong International and want keys in hand. We meet you where you are, and we collect the car the same way when your trip ends.",
  points: [
    {
      title: "Airport pickup and return",
      body:
        "We meet you at Louis Armstrong International and hand off the car when you land. Tell us your flight number and we track it.",
    },
    {
      title: "Hotel delivery",
      body:
        "We bring the car to your hotel downtown or in the Central Business District on the morning you need it.",
    },
    {
      title: "French Quarter delivery",
      body:
        "We deliver to Quarter addresses where curb space runs tight, and we collect the car from the same block at the end of your rental.",
    },
    {
      title: "Office pickup",
      body:
        "Come get the car yourself at 209 S Broad Street, a short drive from downtown and the Quarter.",
    },
  ],
};

/**
 * REVIEW: placeholder testimonials.
 *
 * These sample quotes hold the layout and show James the shape of the section.
 * He approves them or supplies quotes from his own customers.
 * No review text from Yelp or Google appears anywhere on this site.
 */
export const TESTIMONIALS = [
  {
    quote:
      "They met my flight and handed me the keys at the curb. I drove out of the airport in ten minutes.",
    name: "Customer name",
    detail: "Airport delivery",
  },
  {
    quote:
      "I called on a Friday afternoon for a car the next morning. A real person picked up and had it at my hotel by eight.",
    name: "Customer name",
    detail: "Hotel delivery",
  },
  {
    quote:
      "Same family every trip I take to New Orleans. They remember my name and they remember what I drive.",
    name: "Customer name",
    detail: "Repeat customer",
  },
];

export const ABOUT = {
  eyebrow: "About us",
  title: "A New Orleans Family Business Since 2001.",
  lead:
    "James Washington opened A Priority One Rent-A-Car on South Broad Street in 2001 with one idea about renting cars in this city: the person who answers the phone should be the person who hands you the keys.",
  body: [
    "Two decades later that rule still runs the office. Customers call and reach someone who knows the fleet and knows the city. That person can name the exact car sitting on the lot that morning.",
    "The lot stays local on purpose. We know which Quarter blocks fit a compact and nothing larger, and we know how long the drive to Louis Armstrong really takes at 4:00 PM on a Friday. That knowledge rides along with every rental.",
    "Families come back to us across years of visits. Business travelers keep our number in their phones. Both groups stay for the same reason: they talk to the people who own the outcome.",
  ],
  values: [
    {
      title: "You reach a person",
      body:
        "Call the office during business hours and someone from the family answers. That person follows your rental start to finish.",
    },
    {
      title: "We come to you",
      body:
        "We bring the car to the airport or to your door. Delivery and pickup work around your schedule.",
    },
    {
      title: "We keep the fleet clean",
      body:
        "Every car goes out cleaned and serviced. What you request is what pulls up.",
    },
  ],
};

/** REVIEW: FAQ answers carry over from the current site, rewritten in affirmative framing. */
export const FAQ = [
  {
    q: "How do I reserve a car?",
    a: "Send a request through the Reserve page with your dates and the class you want. Someone from the office calls you back to confirm the details and hold the vehicle. Call (504) 827-2900 to book straight over the phone.",
  },
  {
    q: "Do you deliver to the airport?",
    a: "Yes. We meet customers at Louis Armstrong International, and we collect the car there at the end of the rental. Include your flight number in your request and we track your arrival.",
  },
  {
    q: "Where else do you deliver?",
    a: "We deliver to hotels downtown and to addresses across the French Quarter and greater New Orleans. Tell us the address in your request and we confirm it on the call.",
  },
  {
    q: "What do I bring to pick up a car?",
    a: "Bring a valid driver license and the payment method you plan to use. We confirm the full document list with you when we confirm your reservation.",
  },
  {
    q: "What are the driver requirements?",
    a: "Every driver brings a valid license and meets our age requirement for the vehicle class. We confirm both when we take your reservation, including any additional drivers you want on the agreement.",
  },
  {
    q: "How does the deposit work?",
    a: "We hold a deposit on your payment method for the length of the rental and release it after the car comes back. We tell you the exact amount before you sign anything.",
  },
  {
    q: "Can I extend my rental?",
    a: "Call the office and we extend it. As long as the car stays available for the additional days, we adjust the agreement over the phone.",
  },
  {
    q: "How should I return the car?",
    a: "Return it to our South Broad Street office, or tell us where to collect it and we come get it. Bring it back with the fuel level noted on your agreement and we close the rental out the same day.",
  },
  {
    q: "Can I drive out of state?",
    a: "Tell us your route when you reserve. We cover trips across the Gulf Coast regularly and we confirm the terms for your specific itinerary on the call.",
  },
];

export const PICKUP_LOCATIONS = [
  "Louis Armstrong International Airport",
  "Hotel or downtown address",
  "French Quarter address",
  "Our office at 209 S Broad St",
  "Another New Orleans address",
];
