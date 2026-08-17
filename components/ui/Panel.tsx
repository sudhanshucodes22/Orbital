import type { CSSProperties, ReactNode } from "react";
import { tokens } from "./tokens";

/** The product surface.
 *
 * Appearance now lives in `.o-panel` (app/product.css) rather than in a style
 * attribute. That is not a style preference: a style attribute cannot express
 * :hover or a transition, and an inline background would have forced every
 * hover rule to win by !important. The `style` prop is still passed through
 * for per-instance overrides — padding, mostly — so existing callers are
 * unaffected.
 *
 * Variants:
 *   accent      the one card on a page that is the primary action
 *   lit         a gradient hairline along the top edge
 *   interactive lifts and glows on hover; use only when the whole card is a
 *               link or a button, because a card that moves under the cursor
 *               and does nothing is a lie
 */
export function Panel({
  children,
  style,
  accent = false,
  lit = false,
  interactive = false,
  className = "",
  /** Entrance delay in ms. Only meaningful with `enter`. */
  enter = false,
  delay = 0,
  ...rest
}: {
  children: ReactNode;
  style?: CSSProperties;
  accent?: boolean;
  lit?: boolean;
  interactive?: boolean;
  className?: string;
  enter?: boolean;
  delay?: number;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "style" | "className">) {
  const classes = [
    "o-panel",
    accent && "o-panel--accent",
    lit && "o-panel--lit",
    interactive && "o-lift",
    enter && "o-enter",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={{ ...(enter && delay ? { animationDelay: `${delay}ms` } : null), ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Small uppercase section label. The metadata voice of the whole product. */
export function Eyebrow({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "muted" }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontFamily: tokens.mono,
        fontSize: 10.5,
        letterSpacing: ".16em",
        textTransform: "uppercase",
        color: tone === "accent" ? "rgba(124,230,255,.75)" : tokens.textFaint,
      }}
    >
      {/* A short rule before the label. Cheap, and it stops the eyebrow from
          reading as a stray line of mono text. */}
      <span
        aria-hidden
        style={{
          width: 14,
          height: 1,
          background:
            tone === "accent"
              ? "linear-gradient(90deg,rgba(124,230,255,.8),rgba(124,230,255,.1))"
              : "rgba(255,255,255,.14)",
        }}
      />
      {children}
    </div>
  );
}

/** Section heading with the display face and the tight tracking the redesign
 *  asks for. Exists so twelve call sites stop restating the same six
 *  properties, and so the scale is decided in one place. */
export function Heading({
  children,
  size = "md",
  /* Level is chosen by the caller and never inferred from size: a page has
   * exactly one h1, and that is a document-structure decision, not a
   * typographic one. */
  as: Tag = "h2",
  style,
}: {
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  as?: "h1" | "h2" | "h3";
  style?: CSSProperties;
}) {
  const sizes = { sm: 15.5, md: 20, lg: 26, xl: 34 } as const;
  const tracking = { sm: "-.01em", md: "-.02em", lg: "-.025em", xl: "-.03em" } as const;

  return (
    <Tag
      style={{
        margin: 0,
        fontFamily: tokens.display,
        fontWeight: 500,
        fontSize: sizes[size],
        lineHeight: size === "xl" ? 1.08 : 1.22,
        letterSpacing: tracking[size],
        color: tokens.text,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}
