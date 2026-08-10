import type { Metadata } from "next";
import {
  Caveat,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Instrument_Serif,
  Space_Grotesk,
} from "next/font/google";
import "./globals.css";
import "./responsive.css";

/* The five families the design loads, with the exact weights and styles
 * requested by the Google Fonts <link> in the artifact export:
 *
 *   Space Grotesk    wght 400;500;600;700
 *   IBM Plex Sans    wght 300;400;500
 *   IBM Plex Mono    wght 400;500
 *   Instrument Serif wght 400, ital 0;1
 *   Caveat           wght 400;600
 *
 * next/font self-hosts the same files Google would serve, so rendering is
 * unchanged while the third-party request, the FOUT and the privacy question
 * all go away. Nothing consumes these variables yet; Phase 2 maps the
 * design's literal `font-family:'Space Grotesk',sans-serif` declarations onto
 * them. Declared here so that mapping is a rename, not a redesign.
 */

/* These variables are declared but deliberately NOT consumed by the design.
 *
 * next/font registers each family under its real name, so the ported CSS can
 * keep the export's own `font-family:'IBM Plex Mono',monospace` declarations
 * and still get the self-hosted file. Applying `fontVariables` to <html> is
 * what pulls the @font-face rules and preloads into the page; the variables
 * themselves are just the mechanism.
 *
 * Routing the design through `var(--font-ibm-plex-mono)` broke visual parity.
 * That variable expands to `"IBM Plex Mono", "IBM Plex Mono Fallback"`, and
 * the synthetic Fallback face (local Arial with size-adjust) sits ahead of the
 * generic family. U+2192 is not in IBM Plex Mono, so the hero arrow rendered
 * in adjusted Arial at 20.19px instead of generic monospace at 9.03px, which
 * widened the hero buttons by 11.16px. Caught by the Phase 3 pixel diff.
 *
 * `adjustFontFallback: false` is the documented way to suppress that face but
 * is not honoured by Next 16.3, so the reliable fix is not to reference the
 * variables at all.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-ibm-plex-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const caveat = Caveat({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-caveat",
  display: "swap",
});

const fontVariables = [
  spaceGrotesk.variable,
  ibmPlexSans.variable,
  ibmPlexMono.variable,
  instrumentSerif.variable,
  caveat.variable,
].join(" ");

/* metadataBase drives absolute URLs for Open Graph and canonical. Set
 * NEXT_PUBLIC_SITE_URL in the deployment environment; the localhost fallback
 * keeps local builds working and is harmless because crawlers never see it.
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Orbital — multimodal AI website engineer",
    template: "%s · Orbital",
  },
  description:
    "Draw it, show it, or say it. Orbital reads intent from a sketch, a photo, "
    + "your voice or a PDF and hands back a production website you can keep "
    + "talking to.",
  applicationName: "Orbital",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Orbital",
    url: "/",
    title: "Orbital — multimodal AI website engineer",
    description:
      "Stop describing it. Show the machine what you mean.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Orbital — multimodal AI website engineer",
    description: "Stop describing it. Show the machine what you mean.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
