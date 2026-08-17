/** Starter briefs offered on the projects list.
 *
 * Copy, not domain — which is why this sits outside lib/domain and imports
 * nothing. Each starter exists so a new account has somewhere to go other than
 * a blank text field: picking one creates a real project through the same
 * service the manual form uses, then lands on the editor with the brief
 * already in the box. The first generation becomes one more click rather than
 * a writing exercise, which is the difference between a demo that stalls on
 * the empty state and one that moves.
 */

export interface Starter {
  id: string;
  /** Card heading. */
  label: string;
  /** One line under the heading, describing the site it produces. */
  blurb: string;
  /** Becomes the project name. */
  projectName: string;
  /** Becomes the project description. */
  description: string;
  /** Pre-filled into the generator's brief field on the editor page. */
  brief: string;
  /** Shown as a mono tag row on the card. Presentation only. */
  tags: readonly string[];
}

export const STARTERS: readonly Starter[] = [
  {
    id: "architecture-studio",
    label: "Architecture studio",
    blurb: "Project index, practice statement, and an enquiry page.",
    projectName: "Kollegie Arkitekter",
    description: "Copenhagen architecture practice — daylight, glass and oak.",
    brief:
      "An architecture studio in Copenhagen working in daylight, glass and oak. " +
      "Quiet and confident, lots of white space, large photography, a serif " +
      "wordmark. Pages for selected projects, the practice, and an enquiry form.",
    tags: ["EDITORIAL", "3 PAGES"],
  },
  {
    id: "coffee-roastery",
    label: "Coffee roastery",
    blurb: "Origin stories, a subscription tier, and a stockist map.",
    projectName: "Meridian Roasters",
    description: "Single-origin roastery with a subscription and wholesale arm.",
    brief:
      "A single-origin coffee roastery. Warm and tactile — cream, clay and deep " +
      "brown, generous product photography, hand-set type. Show the current " +
      "origins with tasting notes, a subscription tier, and where to buy.",
    tags: ["WARM", "COMMERCE"],
  },
  {
    id: "saas-analytics",
    label: "Analytics SaaS",
    blurb: "Product tour, pricing table, and a developer-facing docs entry.",
    projectName: "Cadence Analytics",
    description: "Product analytics for teams that ship weekly.",
    brief:
      "A product analytics tool for engineering teams. Technical and precise — " +
      "dark interface, monospace accents, a dense feature grid and a real " +
      "pricing table with three tiers. Lead with the dashboard, not a slogan.",
    tags: ["DARK", "PRICING"],
  },
  {
    id: "photo-portfolio",
    label: "Photographer portfolio",
    blurb: "A full-bleed series index, an about page, and booking details.",
    projectName: "Ilse Vermeer",
    description: "Documentary photographer — series index and booking.",
    brief:
      "A documentary photographer's portfolio. Images do the talking: full-bleed " +
      "series, almost no chrome, small quiet type. An index of series, a short " +
      "biography, and how to commission work.",
    tags: ["MINIMAL", "GALLERY"],
  },
] as const;

export function findStarter(id: string): Starter | undefined {
  return STARTERS.find((starter) => starter.id === id);
}
