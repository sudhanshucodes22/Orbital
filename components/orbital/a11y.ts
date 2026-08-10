import type React from "react";

/** Keyboard activation for elements that carry `role="button"`.
 *
 * The design uses styled `<div>`s as click targets. Converting them to real
 * `<button>` elements would drag in user-agent styling and change rendering,
 * so they keep `role="button"` plus this handler instead. Space is prevented
 * so it activates rather than scrolling the page.
 */
export function activateOnKey(handler: () => void) {
  return (event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler();
    }
  };
}

/** True when the user has asked the OS to minimise animation. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
