import { notFound } from "next/navigation";
import App from "../../App";

const META = {
  "/": ["Social Following Studios | Own Your Audience", "Own your audience."],
  "/what-we-do": ["What We Do | Social Following Studios", "Four capabilities. One operator."],
  "/full-service-esp": ["Full-Service ESP | Social Following Studios", "We build and run unified conversion systems."],
  "/industries": ["Industries | Social Following Studios", "Built for regulated and compliance-heavy operating environments."],
  "/results": ["Results | Social Following Studios", "Verified case studies from the actual work."],
  "/insights": ["Insights | Social Following Studios", "Operational knowledge from the work."],
  "/about": ["About | Social Following Studios", "The execution layer behind unified conversion systems."],
  "/system": ["What We Do | Social Following Studios", "Four capabilities. One operator."],
  "/audience-builder": ["Audience Builder | Social Following Studios", "The reachable audience under every send."],
  "/case-studies": ["Proof | Social Following Studios", "Verified case studies from the actual work."],
  "/assessment": ["Book Your Assessment | Social Following Studios", "Database health, reachable audience, deliverability, and a deployment path."],
  "/contact": ["Contact | Social Following Studios", "Contact Social Following Studios."],
  "/avatar-studio": ["Avatar Studio | Social Following Studios", "Your twin, working 24/7."],
  "/terms": ["Terms | Social Following Studios", "Terms for Social Following Studios."],
  "/privacy": ["Privacy | Social Following Studios", "Privacy at Social Following Studios."],
  "/thank-you": ["Request received | Social Following Studios", "Thanks. We have your request."],
};

function routeFor(slug) {
  return slug?.length ? `/${slug.join("/")}` : "/";
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const route = routeFor(slug);
  if (!META[route]) return {};
  const [title, description] = META[route];
  return {
    title,
    description,
    alternates: { canonical: route === "/" ? "/" : `${route}/` },
  };
}

export default async function SitePage({ params }) {
  const { slug } = await params;
  const route = routeFor(slug);
  if (!META[route]) notFound();
  return <App initialRoute={route} />;
}
