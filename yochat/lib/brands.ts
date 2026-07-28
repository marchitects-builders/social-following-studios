import type { AutomationRule, BrandConfig, BrandKey, Intent } from "@/lib/types";

const commonRules: AutomationRule[] = [
  {
    id: "human",
    name: "Human help",
    enabled: true,
    triggers: ["message", "comment", "story_reply", "mention", "referral", "test"],
    keywords: ["human", "person", "agent", "representative", "call me"],
    intent: "human",
    createHandoff: true,
    tags: ["needs-human"],
  },
  {
    id: "pricing",
    name: "Pricing questions",
    enabled: true,
    triggers: ["message", "comment", "story_reply", "mention", "referral", "test"],
    keywords: ["price", "pricing", "cost", "how much", "rate", "rates", "package"],
    intent: "pricing",
    tags: ["pricing-interest"],
  },
  {
    id: "booking",
    name: "Booking intent",
    enabled: true,
    triggers: ["message", "comment", "story_reply", "mention", "referral", "test"],
    keywords: ["book", "booking", "appointment", "consultation", "meeting", "schedule", "calendar"],
    intent: "booking",
    tags: ["booking-interest"],
  },
  {
    id: "lead-capture",
    name: "Lead capture",
    enabled: true,
    triggers: ["message", "comment", "story_reply", "mention", "referral", "test"],
    keywords: ["email", "phone", "contact me", "send it", "interested"],
    intent: "lead_capture",
    collect: ["email", "phone"],
    tags: ["lead"],
  },
];

const defaults: Record<BrandKey, BrandConfig> = {
  marchitects: {
    key: "marchitects",
    automationEnabled: true,
    name: "Marketing Automation Architects",
    shortName: "Marchitects",
    description:
      "A growth-systems and automation consultancy that designs websites, funnels, AI assistants, integrations, and revenue operations.",
    voice: "Strategic, decisive, practical, sophisticated, and concise. Explain the business outcome before the technology.",
    disclosure: "I’m Marchitects’ automated assistant. I can answer questions, qualify your needs, or connect you with Rashida.",
    objectives: ["qualify growth opportunities", "recommend the right service", "capture lead details", "book a consultation"],
    pageId: "100666925801808",
    instagramId: "17841462233763049",
    website: "https://www.marchitects.builders/",
    bookingUrl: "https://www.marchitects.builders/",
    handoffEmail: "webmaster@marchitects.builders",
    knowledge: [
      { id: "services", title: "Services", enabled: true, content: "Marchitects designs growth systems, websites, funnels, CRM and marketing automation, AI assistants, and business integrations." },
      { id: "approach", title: "Approach", enabled: true, content: "Start with the business bottleneck, map the customer journey, then build the smallest reliable system that produces a measurable outcome." },
      { id: "booking", title: "Consultations", enabled: true, content: "Prospects can request a consultation. Ask what they sell, their current bottleneck, timeline, and preferred contact information." },
    ],
    rules: [
      ...commonRules,
      { id: "audit", name: "Automation audit", enabled: true, triggers: ["message", "comment", "story_reply", "referral", "test"], keywords: ["audit", "growth system", "automation help", "funnel"], intent: "services", response: "I can help with that. What are you selling, and where does the current customer journey break down?", tags: ["audit-lead"] },
    ],
  },
  "social-following": {
    key: "social-following",
    automationEnabled: true,
    name: "Social Following",
    shortName: "Social Following",
    description: "A social growth engine that turns content engagement into leads, conversations, community, and measurable sales opportunities.",
    voice: "Energetic, clear, encouraging, current, and conversion-aware without being pushy.",
    disclosure: "I’m Social Following’s automated assistant. I can share resources, answer growth questions, or bring in Rashida.",
    objectives: ["turn engagement into conversations", "deliver lead magnets", "capture qualified leads", "recommend social growth services"],
    pageId: "554581997738729",
    instagramId: "17841460118425871",
    handoffEmail: "webmaster@marchitects.builders",
    knowledge: [
      { id: "growth", title: "Growth method", enabled: true, content: "Social Following connects posts, reels, comments, DMs, lead magnets, follow-up, and offers into one measurable growth loop." },
      { id: "audit", title: "Social audit", enabled: true, content: "A social audit reviews positioning, content, calls to action, profile conversion, engagement paths, and follow-up." },
      { id: "lead-magnets", title: "Lead magnets", enabled: true, content: "Lead magnets should solve one immediate problem and move the contact toward a relevant next step." },
    ],
    rules: [
      ...commonRules,
      { id: "grow", name: "Growth keyword", enabled: true, triggers: ["comment", "message", "story_reply", "referral", "test"], keywords: ["grow", "growth", "followers", "reach", "engagement"], intent: "services", response: "Let’s turn that attention into a system. What is the main result you want right now: reach, leads, bookings, or sales?", tags: ["growth-lead"] },
      { id: "guide", name: "Lead magnet delivery", enabled: true, triggers: ["comment", "message", "referral", "test"], keywords: ["guide", "checklist", "freebie", "resource"], intent: "lead_capture", response: "I can send the right resource. What email should it go to, and what are you trying to improve first?", tags: ["lead-magnet"] },
    ],
  },
  aafc: {
    key: "aafc",
    automationEnabled: true,
    name: "Artists And Athletes For Change",
    shortName: "AAFC",
    description: "A mission-driven organization connecting artists, athletes, communities, programs, partners, volunteers, donors, and opportunities for change.",
    voice: "Warm, inclusive, respectful, community-centered, hopeful, and direct.",
    disclosure: "I’m AAFC’s automated assistant. I can help with programs, partnerships, volunteering, events, donations, or connect you with the team.",
    objectives: ["route people to the right program", "support artists and athletes", "capture partner and volunteer interest", "answer event and donation questions"],
    pageId: "1051001691422441",
    instagramId: "17841480544451772",
    website: "https://www.aafcbuilders.org/",
    handoffEmail: "webmaster@marchitects.builders",
    knowledge: [
      { id: "mission", title: "Mission", enabled: true, content: "AAFC connects artists, athletes, programs, partners, and communities to create practical opportunities and positive change." },
      { id: "participation", title: "Ways to participate", enabled: true, content: "People can ask about programs, events, volunteering, partnerships, sponsorships, donations, and opportunities for artists or athletes." },
      { id: "routing", title: "Routing", enabled: true, content: "Collect the person’s role, location, interest, timeline, and contact information before handing the request to the appropriate team member." },
    ],
    rules: [
      ...commonRules,
      { id: "volunteer", name: "Volunteer interest", enabled: true, triggers: ["message", "comment", "story_reply", "referral", "test"], keywords: ["volunteer", "help out", "get involved"], intent: "volunteer", response: "We’d love to learn how you want to help. What city are you in, and what kind of work or events interest you?", tags: ["volunteer-lead"] },
      { id: "partner", name: "Partnership interest", enabled: true, triggers: ["message", "comment", "story_reply", "referral", "test"], keywords: ["partner", "partnership", "sponsor", "collaborate"], intent: "partnership", response: "Thank you for considering a partnership with AAFC. Please share your organization, the collaboration you have in mind, and the best email for follow-up.", tags: ["partner-lead"] },
      { id: "donate", name: "Donation interest", enabled: true, triggers: ["message", "comment", "story_reply", "referral", "test"], keywords: ["donate", "donation", "support financially", "give"], intent: "donation", response: "Thank you for wanting to support the mission. I can connect you with the team for the current donation options. What is the best email for follow-up?", tags: ["donor-interest"] },
      { id: "events", name: "Event questions", enabled: true, triggers: ["message", "comment", "story_reply", "mention", "test"], keywords: ["event", "program", "cohort", "workshop", "when", "where"], intent: "event", tags: ["event-interest"] },
    ],
  },
};

export function getDefaultBrand(key: BrandKey): BrandConfig {
  return structuredClone(defaults[key]);
}

export function getDefaultBrands(): BrandConfig[] {
  return Object.values(defaults).map((brand) => structuredClone(brand));
}

export function resolveBrandKey(channel: string, accountId: string): BrandKey | undefined {
  const match = Object.values(defaults).find((brand) =>
    channel === "messenger" ? brand.pageId === accountId : brand.instagramId === accountId,
  );
  return match?.key;
}

export const intentLabels: Record<Intent, string> = {
  greeting: "Greeting",
  pricing: "Pricing",
  services: "Services",
  booking: "Booking",
  lead_capture: "Lead capture",
  partnership: "Partnership",
  volunteer: "Volunteer",
  donation: "Donation",
  event: "Event",
  support: "Support",
  complaint: "Complaint",
  human: "Human handoff",
  opt_out: "Opt out",
  opt_in: "Opt in",
  unknown: "General question",
};
