import "../index.css";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import { cn } from "@/lib/utils";

// These are the typefaces from the approved "Your database, reactivated."
// build. Keeping them bundled through Next prevents a fallback to Geist.
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700", "800"],
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant-garamond",
  weight: ["400", "500", "600"],
});

export const metadata = {
  title: "Social Following Studios | Own Your Audience",
  description:
    "Social Following Studios is a full-service ESP and a strategic growth and communications agency.",
  metadataBase: new URL("https://www.socialfollowing.shop"),
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={cn(dmSans.variable, cormorant.variable)}>
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
