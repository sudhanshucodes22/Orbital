/** What a request is asking for.
 *
 * ## Why classify at all
 *
 * Two things use this, and neither is cosmetic:
 *
 *   1. **Context selection.** "Change the hero CTA colour" needs the page with
 *      the hero and the token file, not every file in the project. Knowing the
 *      request is a *style* change rather than a *feature* change narrows what
 *      is worth retrieving before anything is retrieved.
 *   2. **Planning.** A `fix` gets latitude to touch whatever is broken; a
 *      `style` change should not be restructuring markup. The distinction is
 *      already in `PlanIntent`, but nothing computed it before the planner ran.
 *
 * ## Why it is deterministic
 *
 * A model call to decide whether something is a style change would double the
 * latency and the cost of every edit to answer a question keywords answer
 * adequately. This runs in microseconds, is free, and is exactly reproducible
 * in tests. When it is unsure it says so, and the planner — which *is* a model
 * — makes the real decision. It is a hint, never an override.
 */
import type { PlanIntent } from "./run";

/** Coarser than `PlanIntent`, because it answers a different question: what
 *  kind of work is this, rather than what will the plan do. */
export type RequestIntent =
  | "create"
  | "modify"
  | "fix"
  | "style"
  | "responsive"
  | "addFeature"
  | "remove"
  | "explain";

export const REQUEST_INTENTS: readonly RequestIntent[] = [
  "create",
  "modify",
  "fix",
  "style",
  "responsive",
  "addFeature",
  "remove",
  "explain",
];

export interface IntentClassification {
  intent: RequestIntent;
  /** Whether the wording actually indicated this, or it is the fallback.
   *
   * Surfaced so a caller can decline to act on a guess: an unsure `modify` is
   * the default for "anything else", not evidence of a modification. */
  confident: boolean;
  /** Terms in the request that name parts of a page — "hero", "navbar",
   *  "footer". What context retrieval should prefer. */
  subjects: readonly string[];
}

/** Ordered: the first match wins, most specific first.
 *
 * `remove` precedes `addFeature` because "remove the pricing section" contains
 * "section"; `fix` precedes `style` because "the button is broken and ugly" is
 * a fix first. Ordering is the whole design here — a scoring scheme would be
 * harder to reason about and no more accurate on inputs this short.
 */
const RULES: readonly { intent: RequestIntent; pattern: RegExp }[] = [
  {
    intent: "explain",
    pattern: /^\s*(what|why|how|where|which|explain|describe|tell me|show me)\b|\?\s*$/i,
  },
  {
    intent: "remove",
    pattern: /\b(remove|delete|drop|get rid of|take out|strip)\b/i,
  },
  {
    intent: "fix",
    pattern: /\b(fix|broken|bug|not working|doesn'?t work|error|wrong|misaligned|overlap)\b/i,
  },
  {
    intent: "responsive",
    pattern: /\b(responsive|mobile|tablet|small screen|breakpoint|viewport)\b/i,
  },
  {
    intent: "create",
    // A bounded gap rather than an exact article, because the verb and the
    // noun are routinely separated — "build me a site", "create a simple
    // landing page". Bounded so it cannot match a verb in one clause and a
    // noun three sentences later.
    pattern: /\b(build|create|generate|scaffold|start)\b[^.!?]{0,40}?\b(site|website|page|app|landing)\b/i,
  },
  {
    intent: "addFeature",
    pattern: /\b(add|introduce|include|insert)\b.*\b(section|page|form|component|feature|gallery|testimonial|faq|nav|footer|header)\b/i,
  },
  {
    intent: "style",
    pattern:
      /\b(colou?r|palette|theme|dark|light|font|typography|spacing|padding|margin|rounded|shadow|gradient|glass|premium|style|restyle|look|feel|bolder|cleaner|modern)\b/i,
  },
];

/** Parts of a page a request can be about. Used to bias retrieval toward the
 *  files that define them. */
const SUBJECT_TERMS: readonly string[] = [
  "hero",
  "navbar",
  "nav",
  "header",
  "footer",
  "cta",
  "button",
  "pricing",
  "contact",
  "testimonial",
  "gallery",
  "form",
  "menu",
  "sidebar",
  "card",
  "banner",
  "logo",
  "title",
  "headline",
  "subheading",
  "section",
];

/** Classifies a request. Never throws; an empty instruction is `modify`,
 *  unsure. */
export function classifyIntent(instruction: string): IntentClassification {
  const text = instruction.trim();
  const subjects = SUBJECT_TERMS.filter((term) =>
    new RegExp(`\\b${term}s?\\b`, "i").test(text)
  );

  if (!text) return { intent: "modify", confident: false, subjects: [] };

  for (const rule of RULES) {
    if (rule.pattern.test(text)) {
      return { intent: rule.intent, confident: true, subjects };
    }
  }

  // The honest default. Most instructions to a builder are modifications, and
  // saying so with `confident: false` is better than forcing a wrong label.
  return { intent: "modify", confident: false, subjects };
}

/** The planner's vocabulary, which is narrower.
 *
 * `explain` has no `PlanIntent` because the pipeline can only produce file
 * operations — there is nowhere for an answer to go. It maps to `modify` so
 * the planner still receives a valid hint, and the gap is noted rather than
 * silently swallowed: answering questions is a capability Orbital does not
 * have yet.
 */
export function toPlanIntent(intent: RequestIntent): PlanIntent {
  switch (intent) {
    case "create":
      return "create";
    case "fix":
      return "fix";
    case "style":
    case "responsive":
      return "restyle";
    case "addFeature":
      return "extend";
    case "remove":
    case "modify":
    case "explain":
      return "modify";
  }
}

/** Whether a request is asking a question rather than for a change.
 *
 * Worth knowing separately: the pipeline has no way to answer one, and telling
 * someone that is better than generating an unrequested edit. */
export function isQuestion(intent: RequestIntent): boolean {
  return intent === "explain";
}
