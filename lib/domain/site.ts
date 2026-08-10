import type { Timestamp } from "./ids";

/** A generated page within a site. `path` is route-shaped ("/", "/pricing"). */
export interface SitePage {
  path: string;
  title: string;
  /** Source of the page as produced by the engine. */
  source: string;
}

export interface SiteAsset {
  path: string;
  storageKey: string;
  mimeType: string;
  byteSize: number;
}

export type ExportTarget =
  | "react"
  | "nextjs"
  | "html"
  | "tailwind"
  | "vue"
  | "angular"
  | "flutter"
  | "react-native"
  | "wordpress";

export interface GeneratedSite {
  pages: SitePage[];
  assets: SiteAsset[];
  /** Design-system tokens the engine settled on, so a later edit can stay
   *  consistent instead of re-deriving them. */
  tokens: Record<string, string>;
  generatedAt: Timestamp;
}
