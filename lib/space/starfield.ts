/** The starfield, extracted from the landing page so both it and the product
 *  pages draw from one implementation.
 *
 * Every default below is the landing page's existing value, so calling this
 * with no options reproduces exactly what it drew before. The product pages
 * pass a sparser, dimmer, slower configuration: same sky, further away.
 *
 * Returns a dispose function. Canvas only — no DOM assumptions beyond the
 * element handed in — so it is safe to call from any client component.
 */
export interface StarfieldOptions {
  /** Area per star. Larger is sparser. Landing: 3400 desktop, 6200 mobile. */
  density?: number;
  /** Ceiling on the backing-store scale. */
  dprCap?: number;
  /** Vertical and horizontal drift per frame, scaled by each star's depth. */
  driftY?: number;
  driftX?: number;
  /** Multiplies every star's alpha. 1 is the landing page. */
  intensity?: number;
  /** The cross-shaped flare on the brightest stars at peak twinkle. */
  flare?: boolean;
  /** False draws a single frame and stops, for prefers-reduced-motion. */
  animate?: boolean;
}

export function createStarfield(
  canvas: HTMLCanvasElement,
  options: StarfieldOptions = {}
): () => void {
  const {
    density = 3400,
    dprCap = 2,
    driftY = 0.14,
    driftX = 0.04,
    intensity = 1,
    flare = true,
    animate = true,
  } = options;

  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  let stars: { x: number; y: number; z: number; r: number; tw: number }[] = [];
  let w = 0;
  let h = 0;
  let raf = 0;

  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);

  const resize = () => {
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round((w * h) / density);
    stars = Array.from({ length: n }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      z: Math.random() * 0.85 + 0.15,
      r: Math.random() * 1.25 + 0.25,
      tw: Math.random() * Math.PI * 2,
    }));
  };

  resize();
  window.addEventListener("resize", resize);

  let t = 0;
  const draw = () => {
    t += 0.016;
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      s.y -= s.z * driftY;
      s.x += s.z * driftX;
      if (s.y < -2) {
        s.y = h + 2;
        s.x = Math.random() * w;
      }
      if (s.x > w + 2) s.x = -2;

      const tw = 0.45 + 0.55 * Math.pow(Math.abs(Math.sin(t * (0.9 + s.z * 1.7) + s.tw)), 2.2);
      const a = (0.24 + 0.76 * s.z) * tw * intensity;
      ctx.beginPath();
      ctx.fillStyle =
        s.z > 0.72
          ? "rgba(196,238,255," + a.toFixed(3) + ")"
          : "rgba(255,255,255," + (a * 0.72).toFixed(3) + ")";
      ctx.arc(s.x, s.y, s.r * s.z, 0, Math.PI * 2);
      ctx.fill();

      if (flare && s.z > 0.9 && tw > 0.94) {
        ctx.globalAlpha = (tw - 0.94) * 8 * intensity;
        ctx.strokeStyle = "rgba(190,235,255,.7)";
        ctx.lineWidth = 0.7;
        const g = s.r * 4.5;
        ctx.beginPath();
        ctx.moveTo(s.x - g, s.y);
        ctx.lineTo(s.x + g, s.y);
        ctx.moveTo(s.x, s.y - g);
        ctx.lineTo(s.x, s.y + g);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    if (animate) raf = requestAnimationFrame(draw);
  };
  draw();

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
  };
}
