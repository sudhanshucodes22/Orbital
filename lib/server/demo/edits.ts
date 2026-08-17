/** Targeted edits for the template engine. SERVER ONLY.
 *
 * ## Why this exists
 *
 * The template producer used to rebuild the whole site from the instruction on
 * every turn: four files rewritten, whether or not they were relevant. That is
 * regeneration, not editing — and it made the workspace *look* like an
 * iterative editor while behaving like a one-shot generator. Asking for a
 * navbar replaced the hero text, because the hero text was derived from
 * "whatever the last instruction said".
 *
 * This module makes demo mode do what the model path is instructed to do:
 * change the files the request is about and leave the rest alone.
 *
 * ## What it is and is not
 *
 * Deterministic keyword matching, not language understanding. It is honest
 * about that — the run records `mode: "demo"` and the UI says TEMPLATE, so
 * nothing here can be mistaken for a model's work. Its job is to make the
 * editing *loop* real and testable without an API key: targeted operations,
 * only on files that actually change, against the current project state.
 *
 * Every rule returns `null` when it cannot find what it expects. A rule that
 * guessed would produce a diff that does not match what was asked for, which
 * is worse than reporting that nothing changed.
 */

/** An edit that knows which files it applies to and what it changes. */
export interface EditRule {
  id: string;
  /** Matched against the lowercased instruction. */
  triggers: readonly RegExp[];
  /** One line describing the change, used as the plan summary. */
  describe(instruction: string): string;
  /** Returns the new content, or null when this file is not affected. */
  apply(path: string, content: string, instruction: string): string | null;
}

/* ------------------------------------------------------------ colour ----- */

/** Named colours the engine can actually apply. Deliberately small: a rule
 *  that mapped every colour word to a plausible hex would be inventing, and
 *  the diff would not match the request. */
const PALETTE: Record<string, { accent: string; em: string }> = {
  cyan: { accent: "#7ce6ff", em: "#a9e4ff" },
  blue: { accent: "#6aa8ff", em: "#9dc0ff" },
  violet: { accent: "#a48bff", em: "#c4b3ff" },
  purple: { accent: "#a48bff", em: "#c4b3ff" },
  magenta: { accent: "#ff8fd8", em: "#ffb3e4" },
  pink: { accent: "#ff8fd8", em: "#ffb3e4" },
  amber: { accent: "#ffc76a", em: "#ffd99a" },
  gold: { accent: "#ffc76a", em: "#ffd99a" },
  orange: { accent: "#ff9f6a", em: "#ffbf9a" },
  green: { accent: "#6ee7a8", em: "#a3f0c8" },
  emerald: { accent: "#6ee7a8", em: "#a3f0c8" },
  red: { accent: "#ff8f8f", em: "#ffb3b3" },
  warm: { accent: "#ffc76a", em: "#ffd99a" },
  warmer: { accent: "#ffc76a", em: "#ffd99a" },
  cool: { accent: "#7ce6ff", em: "#a9e4ff" },
  cooler: { accent: "#7ce6ff", em: "#a9e4ff" },
};

/** The colour a request is asking for, if it names one this engine knows. */
export function requestedColour(instruction: string): { accent: string; em: string } | null {
  const words = instruction.toLowerCase().match(/[a-z]+/g) ?? [];
  for (const word of words) {
    const hit = PALETTE[word];
    if (hit) return hit;
  }
  return null;
}

/** Every hex the template uses for its accent, so a re-colour can find them
 *  whatever the current palette is. */
const ACCENT_HEXES = [
  ...new Set(Object.values(PALETTE).flatMap((c) => [c.accent, c.em])),
];

const colourRule: EditRule = {
  id: "palette",
  triggers: [/colou?r|palette|accent|theme|warmer|cooler|cyan|blue|violet|purple|magenta|pink|amber|gold|orange|green|emerald|red/i],
  describe: (instruction) => {
    const colour = requestedColour(instruction);
    return colour ? `Recolour the accent to ${colour.accent}` : "Adjust the palette";
  },
  apply(path, content, instruction) {
    const colour = requestedColour(instruction);
    if (!colour) return null;

    if (path.endsWith(".json")) {
      // The token file is the source of truth for the palette, so it is
      // rewritten from its parsed form rather than by string surgery.
      try {
        const tokens = JSON.parse(content) as Record<string, string>;
        if (!("color-accent" in tokens)) return null;
        if (tokens["color-accent"] === colour.accent) return null;
        tokens["color-accent"] = colour.accent;
        return `${JSON.stringify(tokens, null, 2)}\n`;
      } catch {
        return null;
      }
    }

    if (!path.endsWith(".html")) return null;

    // Replace whichever accent the page currently uses. Case-insensitive
    // because a hand-edited page may not match the template's casing.
    let next = content;
    for (const hex of ACCENT_HEXES) {
      next = next.replaceAll(new RegExp(hex, "gi"), (match) =>
        // The em colour is the lighter of the pair and is used for the
        // headline accent; everything else takes the primary.
        ACCENT_HEXES.indexOf(match.toLowerCase()) % 2 === 1 ? colour.em : colour.accent
      );
    }
    // rgba() forms of the accent carry their own channels; rewrite the common
    // one the template emits so the eyebrow does not stay the old hue.
    next = next.replace(/rgba\(124,\s*230,\s*255,/g, rgbaFor(colour.accent));

    return next === content ? null : next;
  },
};

/** The rgba() prefix for a hex, so translucent uses of the accent follow it. */
function rgbaFor(hex: string): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},`;
}

/* ------------------------------------------------------------ navbar ----- */

const GLASS_NAV = `nav{display:flex;align-items:center;gap:26px;padding:14px 18px;margin-top:18px;font-size:14px;
  position:sticky;top:14px;z-index:20;border-radius:14px;
  background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.10);
  backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4)}`;

const navbarRule: EditRule = {
  id: "navbar",
  triggers: [/navbar|nav bar|\bnav\b|header bar|glassmorph|glass/i],
  describe: () => "Restyle the navigation as a glass bar",
  apply(path, content) {
    if (!path.endsWith(".html")) return null;
    // Anchored on the template's own declaration. If a page does not have it,
    // this rule has nothing to say about that page.
    const original = /nav\{display:flex;align-items:center;gap:26px;padding:26px 0 0;font-size:14px\}/;
    if (!original.test(content)) return null;
    return content.replace(original, GLASS_NAV);
  },
};

/* -------------------------------------------------------------- hero ----- */

const heroRule: EditRule = {
  id: "hero",
  triggers: [/hero|headline|banner|masthead|above the fold/i],
  describe: () => "Rework the hero section",
  apply(path, content, instruction) {
    // The hero lives on the home page only; changing it everywhere would be
    // touching files the request did not name.
    if (path !== "index.html") return null;

    const lede = /(<p class="lede">)([\s\S]*?)(<\/p>)/;
    if (!lede.test(content)) return null;

    let next = content.replace(lede, `$1${escapeHtml(instruction)}$3`);

    // A "premium" request also lifts the type scale, so the change is visible
    // rather than only textual.
    if (/premium|bolder|bigger|stronger|dramatic|luxur/i.test(instruction)) {
      next = next.replace(
        /h1\{margin:20px 0 0;font-size:clamp\(34px,6vw,60px\)/,
        "h1{margin:24px 0 0;font-size:clamp(40px,7vw,74px);letter-spacing:-.035em"
      );
    }
    return next === content ? null : next;
  },
};

/* --------------------------------------------------------------- CTA ----- */

const ctaRule: EditRule = {
  id: "cta",
  triggers: [/\bcta\b|call to action|button/i],
  describe: () => "Restyle the primary call to action",
  apply(path, content, instruction) {
    if (!path.endsWith(".html")) return null;

    const button = /\.btn\{padding:12px 22px;border-radius:999px/;
    if (!button.test(content)) return null;

    const colour = requestedColour(instruction);
    let next = content.replace(
      button,
      ".btn{padding:14px 26px;border-radius:999px;letter-spacing:.01em"
    );

    // "Make the CTA cyan" is a colour request scoped to one element; applying
    // the palette rule wholesale would recolour the whole page instead.
    if (colour) {
      next = next.replace(
        /(\.btn\.solid\{[^}]*background:)[^;}]+/,
        `$1linear-gradient(135deg,${colour.em},${colour.accent})`
      );
    }
    return next === content ? null : next;
  },
};

/* -------------------------------------------------------- responsive ----- */

const RESPONSIVE_BLOCK = `@media (max-width:820px){.row{flex-direction:column;align-items:stretch}
  .grid{grid-template-columns:1fr}h1{font-size:clamp(30px,8vw,44px)}
  .wrap{padding:0 18px}}`;

const responsiveRule: EditRule = {
  id: "responsive",
  triggers: [/responsive|mobile|small screen|tablet|breakpoint/i],
  describe: () => "Add a tablet and mobile breakpoint",
  apply(path, content) {
    if (!path.endsWith(".html")) return null;
    // Idempotent: asking twice must not stack two identical blocks.
    if (content.includes("max-width:820px")) return null;
    if (!content.includes("</style>")) return null;
    return content.replace("</style>", `${RESPONSIVE_BLOCK}\n</style>`);
  },
};

/* ------------------------------------------------------------ spacing ---- */

const spacingRule: EditRule = {
  id: "spacing",
  triggers: [/spacing|padding|breathing room|airier|tighter|denser|compact/i],
  describe: (instruction) =>
    /tighter|denser|compact/i.test(instruction) ? "Tighten the layout" : "Open up the layout",
  apply(path, content, instruction) {
    if (!path.endsWith(".html")) return null;
    const tighter = /tighter|denser|compact/i.test(instruction);
    const section = /section\{padding:(\d+)px 0\}/;
    const match = section.exec(content);
    if (!match) return null;
    const current = Number(match[1]);
    const next = tighter ? Math.max(28, current - 16) : current + 16;
    if (next === current) return null;
    return content.replace(section, `section{padding:${next}px 0}`);
  },
};

/** In priority order. The first rule whose trigger matches wins, so a request
 *  mentioning both a CTA and a colour is treated as a CTA change — the more
 *  specific reading, and the one that touches fewer files. */
export const EDIT_RULES: readonly EditRule[] = [
  ctaRule,
  navbarRule,
  heroRule,
  responsiveRule,
  spacingRule,
  colourRule,
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface TargetedChange {
  /** Path → new content, for files that genuinely changed. */
  updates: Map<string, string>;
  /** Which rule produced them, for the plan summary. */
  rule: EditRule | null;
}

/** Works out what an instruction changes about an existing project.
 *
 * Returns only files whose content actually differs. A rule that matched the
 * instruction but changed nothing produces no operation, because reporting a
 * file as edited when it is byte-identical is a lie the diff would expose.
 */
export function planTargetedEdit(
  files: readonly { path: string; content: string | null }[],
  instruction: string
): TargetedChange {
  const updates = new Map<string, string>();
  if (!instruction.trim()) return { updates, rule: null };

  const rule =
    EDIT_RULES.find((candidate) => candidate.triggers.some((t) => t.test(instruction))) ??
    // No keyword matched. The hero lede is the honest default: it is where the
    // template puts the brief, and it changes exactly one file.
    heroRule;

  for (const file of files) {
    if (file.content === null) continue;
    const next = rule.apply(file.path, file.content, instruction);
    if (next !== null && next !== file.content) updates.set(file.path, next);
  }

  return { updates, rule };
}
