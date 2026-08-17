/** Raised when a capability is wired but not yet backed by a real service.
 *
 * This is the mechanism that keeps the foundation honest: rather than
 * returning invented data so a page looks finished, every unimplemented
 * adapter throws this, and the UI renders a notice naming the missing piece.
 * A page that renders is therefore a page that actually works.
 */
export class NotConfiguredError extends Error {
  readonly capability: string;
  readonly requires: readonly string[];

  constructor(capability: string, requires: readonly string[] = []) {
    super(
      `${capability} is not configured.` +
        (requires.length ? ` Requires: ${requires.join(", ")}.` : "")
    );
    this.name = "NotConfiguredError";
    this.capability = capability;
    this.requires = requires;
  }
}

export function isNotConfigured(e: unknown): e is NotConfiguredError {
  return e instanceof NotConfiguredError;
}

/** The caller is not signed in. */
export class UnauthenticatedError extends Error {
  constructor(message = "Not signed in") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/** The caller is signed in but lacks the required role. */
export class ForbiddenError extends Error {
  constructor(message = "Insufficient permissions") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

/** The request is valid but conflicts with the resource's current state.
 *
 * Distinct from ValidationError: nothing about the request is wrong, it simply
 * cannot be honoured right now. The caller's correct response is to wait and
 * retry, not to fix their input. */
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

/** Input failed validation before reaching any service. */
export class ValidationError extends Error {
  readonly field: string | undefined;
  constructor(message: string, field?: string) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}
