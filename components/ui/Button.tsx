import type { ReactNode } from "react";
import Link from "next/link";

/** The product's buttons.
 *
 * Every appearance concern lives in `.o-btn*` (app/product.css) so hover,
 * press and disabled states exist at all — a style attribute cannot express
 * them. This component only picks classes, which is why it is safe to use
 * from both Server and Client Components.
 *
 * `busy` and `disabled` are separate on purpose. A submitting button is still
 * the thing you just pressed and should keep its weight; a disabled one is
 * not currently an action. Rendering "busy" as "disabled" loses that, and
 * loses the accessible announcement with it.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

function classesFor(variant: ButtonVariant, size: "sm" | "md", className?: string): string {
  return ["o-btn", `o-btn--${variant}`, size === "sm" && "o-btn--sm", className]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  busy = false,
  disabled = false,
  className,
  type = "button",
  ...rest
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  busy?: boolean;
  className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className">) {
  return (
    <button
      type={type}
      className={classesFor(variant, size, className)}
      disabled={disabled}
      data-busy={busy || undefined}
      // Announced to assistive tech, which a cursor change alone is not.
      aria-busy={busy || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}

/** A link that looks like a button. Separate component rather than an `as`
 *  prop so the anchor keeps real link behaviour — middle-click, open in new
 *  tab, and a href a screen reader can read out. */
export function ButtonLink({
  children,
  href,
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: {
  children: ReactNode;
  href: string;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  className?: string;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className">) {
  return (
    <Link href={href} className={classesFor(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
