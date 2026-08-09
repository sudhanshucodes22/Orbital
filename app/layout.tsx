import type { Metadata } from "next";
import {
  Caveat,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Instrument_Serif,
  Space_Grotesk,
} from "next/font/google";
import "./globals.css";

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

// Minimal and honest. Open Graph, Twitter cards, canonical and a real favicon
// are Phase 4 — the export has none of them.
export const metadata: Metadata = {
  title: "Orbital",
  description: "A multimodal AI website engineer.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
