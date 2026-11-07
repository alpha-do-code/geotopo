import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { InstallationProvider } from "@/components/installation";
import { Portail } from "@/components/portail";
import { EnregistrerServiceWorker } from "@/components/service-worker";
import { SessionProvider } from "@/components/session";
import "./globals.css";

const plexSans = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "GeoTopo",
  description: "Suivi des travaux de topographie, géodésie et géomatique, du terrain à l'acceptation.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "GeoTopo", statusBarStyle: "black-translucent" },
  icons: { icon: "/icone.svg", apple: "/icone-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#16211d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${plexSans.variable} ${plexMono.variable} antialiased`}>
      {/* Des extensions (Monica, Grammarly…) ajoutent des attributs au <body> avant React :
          on ignore ces écarts sur ce seul élément, pas sur ses enfants */}
      <body className="min-h-dvh font-sans" suppressHydrationWarning>
        <InstallationProvider>
          <SessionProvider>
            <Portail>{children}</Portail>
          </SessionProvider>
        </InstallationProvider>
        <EnregistrerServiceWorker />
      </body>
    </html>
  );
}
