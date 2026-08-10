import type { OrbitalLanding } from "./OrbitalLanding";

/** The flat object the template renders against.
 *
 * Derived from the implementation rather than hand-written, so the template
 * and the logic cannot drift apart. dc-runtime called this the "vals" object;
 * `renderVals()` is ported verbatim from the export.
 */
export type Vals = ReturnType<OrbitalLanding["renderVals"]>;

/** DOM attachment points, passed separately from the render values.
 *
 * Refs are not render data. Passing them inside `Vals` makes React's
 * `react-hooks/refs` rule treat every read of that object as a ref access and
 * flag ~100 plain string reads as errors.
 */
export type Refs = OrbitalLanding["nodeRefs"];
