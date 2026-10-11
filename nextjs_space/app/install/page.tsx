import type { Metadata } from "next";
import { InstallScreen } from "@/components/offline/install-screen";

export const metadata: Metadata = {
  title: "Install LockonDocs",
  robots: { index: false, follow: false },
};

export default function InstallPage() {
  return <InstallScreen />;
}
