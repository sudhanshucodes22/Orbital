/** Credential rules.
 *
 * Here rather than beside the server action because a `"use server"` module
 * may only export async functions — a shared constant cannot live in one. The
 * sign-up form reads this to state the rule before submitting; the action
 * reads it to enforce the rule. One number, so the two cannot disagree.
 */
export const PASSWORD_MIN = 8;
