import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "@/components/pwa-register";
import FirebaseAnalytics from "@/components/firebase-analytics";
export const metadata: Metadata = {
  title: "LoadFactor — Athletic Performance",
  description: "Log your training. Measure your progress. Build your next level.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "LoadFactor", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#f5cc35" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><PwaRegister/><FirebaseAnalytics/>{children}</body></html>;
}
