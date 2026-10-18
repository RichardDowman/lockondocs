export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { RecipientScreen } from "@/components/sharing/recipient-screen";

export function generateMetadata(): Metadata {
  const requestHeaders = headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0].trim() === "http" ? "http" : "https";
  const origin = host ? `${protocol}://${host.split(",")[0].trim()}` : "https://vault.lockondocs.app";
  const title = "Secure document sharing | LockonDocs";
  const description = "A private document shared with you. Open the link and enter the sender's sharing password. No account needed.";
  const image = { url: `${origin}/share-preview-v48.png`, width: 1200, height: 1200, alt: "LockonDocs - secure document sharing" };
  return {
    title, description, robots: { index: false, follow: false }, referrer: "no-referrer",
    openGraph: { title, description, siteName: "LockonDocs", type: "website", images: [image] },
    twitter: { card: "summary", title, description, images: [image.url] },
  };
}
export default function SharePage() { return <RecipientScreen />; }
