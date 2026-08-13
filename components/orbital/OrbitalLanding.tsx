/* Ported from the <script type="text/x-dc"> block of
 * reference/artifact-export/Orbital Launch.dc.html by tools/port/port-logic.mjs.
 * Regenerate with: cd tools/port && node port-logic.mjs
 *
 * Method bodies are verbatim. Only four things were rewritten:
 *   - waitThree() removed; three.js is an npm import, so there is no CDN
 *     global to poll for and initGlobe() is called directly.
 *   - the globe texture is addressed as /earth-equirect.jpg (it now lives in
 *     /public rather than beside the document).
 *   - font-family declarations are left verbatim; see the FONT_VARS note.
 *   - 2d contexts get a null guard for strict mode.
 *
 * The base class changed from dc-runtime's DCLogic to React.Component. DCLogic
 * is a plain class with props/state/setState/forceUpdate and React-identical
 * lifecycle names, driven by a host component, so this is a drop-in swap.
 */
"use client";

import React from "react";
import * as THREE from "three";
import { createStarfield } from "@/lib/space/starfield";
import { prefersReducedMotion } from "./a11y";
import { Template } from "./template";

type State = {
  step: number;
  voice: string;
  vs: number;
  device: number;
  faq: number;
  evTick: number;
  detect: number;
};

export class OrbitalLanding extends React.Component<Record<string, never>, State> {
  /** DOM attachment points, kept out of renderVals(). See rewrite 5. */
  readonly nodeRefs = {
    starRef: React.createRef<HTMLCanvasElement>(),
    globeRef: React.createRef<HTMLCanvasElement>(),
    cometRef: React.createRef<HTMLCanvasElement>(),
    navRef: React.createRef<HTMLElement>(),
    heroStageRef: React.createRef<HTMLDivElement>(),
  };
  private stepRefs = [0, 1, 2, 3, 4, 5].map(() => React.createRef<HTMLDivElement>());

  private disposeStars: (() => void) | undefined;
  private globeRaf = 0;
  private cometRaf = 0;
  private scrollRaf = 0;
  private vTimer: ReturnType<typeof setInterval> | undefined;
  private evTimer: ReturnType<typeof setInterval> | undefined;
  private vsTimer: ReturnType<typeof setInterval> | undefined;
  private io: IntersectionObserver | undefined;
  private stepIo: IntersectionObserver | undefined;
  private onCometResize: (() => void) | undefined;
  private _globeResize: (() => void) | undefined;

  /* When the user has asked the OS to minimise animation, the three canvas
   * loops each draw a single frame and stop, and the timer-driven text stops
   * cycling. The scroll-linked hero morph is left alone: it only advances in
   * response to deliberate scrolling and it carries the section's meaning
   * rather than decorating it. Resolved once at mount, since matchMedia is
   * unavailable during server rendering. */
  private reduce = false;

  /* Phones do the same work on a fraction of the power budget, so the canvas
   * layers are tuned down: lower device-pixel ratio, no MSAA, and a coarser
   * globe mesh. Nothing is removed — the Earth, stars and comet all still run,
   * they just cost less. Resolved at mount alongside `reduce`. */
  private small = false;

  constructor(props: Record<string, never>) {
    super(props);
    this.state = { step: 0, voice: '', vs: 0, device: 1, faq: 0, evTick: 0, detect: 0 };
  }

  componentDidMount() {
    this.reduce = prefersReducedMotion();
    this.small = typeof window !== "undefined" && window.innerWidth <= 768;
    this.initStars();
    this.initComet();
    this.initGlobe();
    this.initScroll();
    this.initReveal();
    if (this.reduce) {
      // Show a completed instruction instead of an empty, blinking caret.
      this.setState({ voice: 'Make the hero section darker.' });
    } else {
      this.startVoice();
      this.evTimer = setInterval(() => this.setState(s => ({ evTick: s.evTick + 1 })), 1700);
      this.vsTimer = setInterval(() => this.setState(s => ({ vs: (s.vs + 1) % 4 })), 5200);
    }
  }

  componentWillUnmount() {
    clearInterval(this.vTimer); clearInterval(this.evTimer); clearInterval(this.vsTimer);
    this.disposeStars?.(); cancelAnimationFrame(this.globeRaf);
    cancelAnimationFrame(this.cometRaf); cancelAnimationFrame(this.scrollRaf);
    if (this.onCometResize) window.removeEventListener('resize', this.onCometResize);
    if (this._globeResize) window.removeEventListener('resize', this._globeResize);
    if (this.io) this.io.disconnect();
    if (this.stepIo) this.stepIo.disconnect();
  }

  initScroll() {
    const root = document.documentElement;
    let last = -1;
    const loop = () => {
      const y = window.scrollY || 0;
      if (y !== last) {
        last = y;
        root.style.setProperty('--sy', y.toFixed(1));
        const st = this.nodeRefs.heroStageRef.current;
        if (st) {
          const r = st.getBoundingClientRect();
          const span = Math.max(1, r.height * 0.72);
          const p = Math.min(1, Math.max(0, (window.innerHeight * 0.82 - r.top) / span));
          root.style.setProperty('--hp', p.toFixed(4));
          const d = Math.min(5, Math.floor(p * 6.2));
          if (d !== this.state.detect) this.setState({ detect: d });
        }
        const nav = this.nodeRefs.navRef.current;
        if (nav) nav.style.padding = y > 40 ? '9px 20px' : '18px 20px';
      }
      this.scrollRaf = requestAnimationFrame(loop);
    };
    loop();
  }

  initReveal() {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    els.forEach(el => { el.style.opacity = '0'; el.style.transform = 'translateY(16px)'; el.style.transition = 'opacity .8s cubic-bezier(.2,.6,.2,1), transform .8s cubic-bezier(.2,.6,.2,1)'; });
    this.io = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) { (e.target as HTMLElement).style.opacity = '1'; (e.target as HTMLElement).style.transform = 'none'; this.io!.unobserve(e.target); } });
    }, { rootMargin: '-8% 0px -12% 0px' });
    els.forEach(el => this.io!.observe(el));

    this.stepIo = new IntersectionObserver(es => {
      es.forEach(e => {
        if (e.isIntersecting) {
          const i = this.stepRefs.findIndex(r => r.current === e.target);
          if (i >= 0 && i !== this.state.step) this.setState({ step: i });
        }
      });
    }, { rootMargin: '-42% 0px -42% 0px' });
    this.stepRefs.forEach(r => { if (r.current) this.stepIo!.observe(r.current); });
  }

  startVoice() {
    const lines = ['Make the hero section darker.', 'Add a glass effect to the cards.', 'Increase the spacing.', 'Make it feel like Apple.'];
    let li = 0, ci = 0, dir = 1;
    this.vTimer = setInterval(() => {
      const full = lines[li];
      ci += dir;
      if (ci > full.length) { dir = -1; ci = full.length; }
      if (ci < 0) { dir = 1; ci = 0; li = (li + 1) % lines.length; }
      this.setState({ voice: full.slice(0, Math.max(0, ci)) });
    }, 58);
  }

  initStars() {
    const cv = this.nodeRefs.starRef.current;
    if (!cv) return;
    // Shared with the product pages' SpaceBackground. These are the values
    // this page has always used, passed explicitly so the extraction cannot
    // drift its appearance.
    this.disposeStars = createStarfield(cv, {
      density: this.small ? 6200 : 3400,
      dprCap: this.small ? 1.5 : 2,
      animate: !this.reduce,
    });
  }

  initComet() {
    const cv = this.nodeRefs.cometRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    let w = 0, h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, this.small ? 1.5 : 2);
    const resize = () => {
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    this.onCometResize = resize;
    window.addEventListener('resize', resize);

    let comet: { x: number; y: number; vx: number; vy: number; len: number; life: number } | null = null, next = 1.2;
    const spawn = () => {
      const speed = 7.5 + Math.random() * 4.5;
      const ang = -(16 + Math.random() * 16) * Math.PI / 180;
      comet = {
        x: -140 - Math.random() * 120,
        y: h * (0.55 + Math.random() * 0.5),
        vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        len: 210 + Math.random() * 150, life: 0
      };
    };
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      next -= 0.016;
      if (!comet && next <= 0) { spawn(); next = 6 + Math.random() * 6; }
      if (comet) {
        comet.x += comet.vx; comet.y += comet.vy; comet.life += 0.016;
        const m = Math.hypot(comet.vx, comet.vy);
        const tx = comet.x - (comet.vx / m) * comet.len;
        const ty = comet.y - (comet.vy / m) * comet.len;
        const fade = Math.min(1, comet.life * 2.6) * Math.min(1, Math.max(0, (w + 300 - comet.x) / 300));
        const grad = ctx.createLinearGradient(comet.x, comet.y, tx, ty);
        grad.addColorStop(0, 'rgba(255,255,255,' + (0.98 * fade).toFixed(3) + ')');
        grad.addColorStop(0.28, 'rgba(196,236,255,' + (0.62 * fade).toFixed(3) + ')');
        grad.addColorStop(1, 'rgba(150,215,255,0)');
        ctx.lineCap = 'round';
        ctx.strokeStyle = grad; ctx.lineWidth = 4.6;
        ctx.beginPath(); ctx.moveTo(comet.x, comet.y); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.strokeStyle = grad; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(comet.x, comet.y); ctx.lineTo(tx, ty); ctx.stroke();
        const halo = ctx.createRadialGradient(comet.x, comet.y, 0, comet.x, comet.y, 16);
        halo.addColorStop(0, 'rgba(255,255,255,' + fade.toFixed(3) + ')');
        halo.addColorStop(0.35, 'rgba(190,235,255,' + (0.5 * fade).toFixed(3) + ')');
        halo.addColorStop(1, 'rgba(150,215,255,0)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(comet.x, comet.y, 16, 0, Math.PI * 2); ctx.fill();
        if (comet.x > w + 340 || comet.y < -340) comet = null;
      }
      if (!this.reduce) this.cometRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  initGlobe() {
    const cv = this.nodeRefs.globeRef.current; if (!cv) return;
    const T = THREE;
    const renderer = new T.WebGLRenderer({ canvas: cv, alpha: true, antialias: !this.small });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.small ? 1.5 : 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.42;
    const size = () => renderer.setSize(cv.clientWidth, cv.clientHeight, false);
    size();
    const scene = new T.Scene();
    const cam = new T.PerspectiveCamera(34, 1, 0.1, 100);
    cam.position.set(0, 0, 11.4);

    const group = new T.Group();
    group.rotation.z = -0.38;
    scene.add(group);

    const R = 2.5;
    const load = new T.TextureLoader();
    const tex = load.load('/earth-equirect.jpg', () => {
      // Under reduced motion the render loop stops after one frame, which can
      // land before the texture resolves. Repaint once it has.
      if (this.reduce) renderer.render(scene, cam);
    });
    tex.wrapS = T.RepeatWrapping;
    tex.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
    tex.encoding = T.sRGBEncoding;
    tex.minFilter = T.LinearMipMapLinearFilter;
    tex.generateMipmaps = true;

    const earth = new T.Mesh(
      new T.SphereGeometry(R, this.small ? 48 : 96, this.small ? 32 : 64),
      new T.MeshBasicMaterial({ map: tex })
    );
    group.add(earth);

    const shade = new T.Mesh(
      new T.SphereGeometry(R * 1.003, 64, 44),
      new T.ShaderMaterial({
        transparent: true, depthWrite: false, blending: T.NormalBlending,
        vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'varying vec3 vN; void main(){ float d = dot(normalize(vN), normalize(vec3(0.85,0.28,0.45))); float night = smoothstep(0.30,-0.45,d); float warm = smoothstep(0.42,0.92,d); gl_FragColor = vec4(mix(vec3(0.012,0.03,0.07), vec3(1.0,0.86,0.64), warm), night*0.30 + warm*0.30); }'
      })
    );
    group.add(shade);

    const glow = new T.Mesh(
      new T.SphereGeometry(R * 1.16, 64, 44),
      new T.ShaderMaterial({
        transparent: true, side: T.BackSide, depthWrite: false, blending: T.AdditiveBlending,
        vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vP = normalize((modelViewMatrix * vec4(position,1.0)).xyz); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'varying vec3 vN; void main(){ float i = pow(0.66 - dot(vN, vec3(0.0,0.0,1.0)), 3.0); gl_FragColor = vec4(0.30,0.66,1.0,1.0) * i * 1.9; }'
      })
    );
    group.add(glow);

    const ring = new T.Mesh(
      new T.RingGeometry(R * 1.46, R * 1.472, this.small ? 90 : 180),
      new T.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.16, side: T.DoubleSide })
    );
    ring.rotation.x = Math.PI / 2.35; ring.rotation.y = 0.2;
    scene.add(ring);

    const orbit = new T.Group(); scene.add(orbit);
    const sat = new T.Mesh(new T.SphereGeometry(0.05, 12, 12), new T.MeshBasicMaterial({ color: 0xbdf1ff }));
    sat.position.set(R * 1.466, 0, 0);
    const holder = new T.Group(); holder.rotation.x = Math.PI / 2.35; holder.rotation.y = 0.2;
    holder.add(sat); orbit.add(holder);

    const onResize = () => {
      size();
      cam.aspect = cv.clientWidth / cv.clientHeight || 1;
      cam.updateProjectionMatrix();
    };
    onResize();
    window.addEventListener('resize', onResize);
    this._globeResize = onResize;

    let t = 0;
    const tick = () => {
      t += 0.0045;
      group.rotation.y += 0.0012;
      shade.rotation.y = -group.rotation.y;
      ring.rotation.z += 0.0009;
      holder.rotation.z = t * 1.6;
      group.position.y = Math.sin(t * 1.1) * 0.06;
      renderer.render(scene, cam);
      if (!this.reduce) this.globeRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  renderVals() {
    const S = this.state;

    const detectLines = [
      'nav_detected  conf .97',
      'hero_block  conf .95',
      '3 × card → feature set',
      'handwriting: "dark background"',
      'responsive rules inferred',
      'components lifted → 8'
    ];
    const detections = detectLines.map((t, i) => ({
      t, o: i <= S.detect ? 1 : 0.06,
      tr: i <= S.detect ? 'translateX(0)' : 'translateX(-8px)'
    }));

    const stepData = [
      { n: 'STEP 01', t: 'Draw', d: 'Paper, whiteboard, napkin. However messy the line is.', title: 'INPUT · PAPER', meta: 'sketch.jpg', log: 'reading page geometry…\nno prompt required' },
      { n: 'STEP 02', t: 'Show', d: 'Point a phone at it. The build updates as the pen moves.', title: 'CAMERA · LIVE', meta: '30 fps', log: 'tracking page…\nframe locked · delta detected' },
      { n: 'STEP 03', t: 'Speak', d: 'Say the change out loud. It lands on the live tree.', title: 'VOICE · LISTENING', meta: 'en-GB', log: '"make the navbar transparent"\napplied · 0 regenerations' },
      { n: 'STEP 04', t: 'Understand', d: 'Intent, not shapes. Three boxes is a question worth asking.', title: 'REASONING', meta: '6 events', log: 'cards → pricing or features?\nawaiting one-tap answer' },
      { n: 'STEP 05', t: 'Build', d: 'Typed components, real routing, responsive from frame one.', title: 'ASSEMBLING', meta: '8 components', log: 'grid generated\ntype scale mapped · a11y pass' },
      { n: 'STEP 06', t: 'Ship', d: 'One click to your host, or export the repo and walk away.', title: 'LIVE', meta: '42ms build', log: 'deployed → aurora.studio\nlighthouse 99' }
    ];
    const steps = stepData.map((s, i) => ({
      n: s.n, t: s.t, d: s.d, ref: this.stepRefs[i],
      go: () => this.setState({ step: i }),
      on: S.step === i,
      dim: S.step === i ? 1 : 0.42,
      numColor: S.step === i ? 'rgba(124,230,255,.9)' : 'rgba(233,235,242,.35)',
      titleColor: S.step === i ? '#f2f6ff' : 'rgba(233,235,242,.72)',
      rule: S.step === i ? 'rgba(124,230,255,.8)' : 'rgba(255,255,255,.12)'
    }));
    const cur = stepData[S.step] || stepData[0];

    const devLabels = ['MOBILE', 'DESKTOP', 'TABLET'];
    const devWidths = ['300px', '100%', '520px'];
    const devices = devLabels.map((t, i) => ({
      t, go: () => this.setState({ device: i }),
      border: S.device === i ? 'rgba(124,230,255,.5)' : 'rgba(255,255,255,.11)',
      bg: S.device === i ? 'rgba(124,230,255,.12)' : 'transparent',
      color: S.device === i ? '#cdf2ff' : 'rgba(233,235,242,.5)'
    }));

    const evPool = [
      'layout detected · 4 regions',
      'typography inferred · 2 families',
      'component mapped · Card ×3',
      'responsive rules generated',
      'interactions connected · 6',
      'contrast checked · AA pass',
      'routing built · 5 pages',
      'handwriting parsed · 3 notes'
    ];
    const events = Array.from({ length: 5 }, (_, k) => {
      const i = (S.evTick + k) % evPool.length;
      return { t: evPool[i], mark: k === 0 ? '▶' : '·', color: k === 0 ? 'rgba(196,236,255,.95)' : 'rgba(233,235,242,.5)' };
    });

    const voiceScript = [
      { t: 'Make the hero section darker.', me: true },
      { t: 'Done — background dropped two stops.', me: false },
      { t: 'Add a glass effect to the cards.', me: true },
      { t: 'Applied to all three. Contrast still AA.', me: false }
    ];
    const voiceLog = voiceScript.map((v, i) => ({
      t: v.t, align: v.me ? 'flex-end' : 'flex-start',
      o: i <= S.vs ? 1 : 0.2,
      border: v.me ? 'rgba(124,230,255,.38)' : 'rgba(255,255,255,.1)',
      bg: v.me ? 'rgba(124,230,255,.12)' : 'rgba(255,255,255,.045)',
      color: v.me ? '#e9f8ff' : 'rgba(233,235,242,.85)'
    }));
    const voiceSteps = ['Darker hero', 'Glass cards', 'More spacing', 'Apple styling'].map((t, i) => ({
      t, go: () => this.setState({ vs: i }),
      border: S.vs === i ? 'rgba(124,230,255,.5)' : 'rgba(255,255,255,.12)',
      bg: S.vs === i ? 'rgba(124,230,255,.12)' : 'rgba(255,255,255,.03)',
      color: S.vs === i ? '#cdf2ff' : 'rgba(233,235,242,.7)'
    }));
    const vsStates = [
      { bg: 'linear-gradient(168deg,#101725,#0a0e17)', badge: 'BASE', pad: '24px 22px 26px', gap: '10px', radius: '10px', cardBg: 'rgba(255,255,255,.04)', cardBorder: 'rgba(255,255,255,.08)', blur: 'none' },
      { bg: 'linear-gradient(168deg,#070a12,#04060b)', badge: 'DARKER', pad: '24px 22px 26px', gap: '10px', radius: '10px', cardBg: 'rgba(255,255,255,.035)', cardBorder: 'rgba(255,255,255,.07)', blur: 'none' },
      { bg: 'linear-gradient(168deg,#070a12,#04060b)', badge: 'GLASS', pad: '26px 24px 28px', gap: '12px', radius: '16px', cardBg: 'rgba(255,255,255,.07)', cardBorder: 'rgba(190,240,255,.24)', blur: 'blur(12px)' },
      { bg: 'linear-gradient(168deg,#08101a,#04070c)', badge: 'APPLE', pad: '38px 32px 40px', gap: '20px', radius: '20px', cardBg: 'rgba(255,255,255,.05)', cardBorder: 'rgba(255,255,255,.1)', blur: 'blur(14px)' }
    ];
    const vsn = vsStates[S.vs];

    const faqData = [
      { q: 'Do I ever have to write a prompt?', a: 'No. Text is one of eight inputs, not the entry fee. Most sessions begin with a photo of a page and end with someone talking out loud.' },
      { q: 'How messy can the sketch be?', a: 'Very. Crossed-out boxes, arrows, margin notes and coffee rings are all signal. When intent is genuinely ambiguous it asks one short question rather than guessing — "pricing cards or feature cards?"' },
      { q: 'Is the code real, or a locked-in export?', a: 'Real. Typed React components, real routing, Tailwind or plain CSS. Export to nine targets at any point and never open Orbital again.' },
      { q: 'What happens when I ask for an edit?', a: 'The live tree is patched in place. Nothing regenerates, so your copy, your images and your manual tweaks survive every instruction.' },
      { q: 'When does the 3D viewer appear?', a: 'Only when product intelligence detects an actual product — a watch, a chair, a shoe. It is offered, never assumed, and you can decline in one tap.' }
    ];
    const faq = faqData.map((f, i) => ({
      q: f.q, n: '0' + (i + 1),
      go: () => this.setState({ faq: i }),
      on: S.faq === i,
      color: S.faq === i ? '#ffffff' : 'rgba(233,235,242,.6)',
      numColor: S.faq === i ? 'rgba(124,230,255,.9)' : 'rgba(233,235,242,.3)'
    }));

    const pill = (t: string, on: boolean) => ({
      t, border: on ? 'rgba(124,230,255,.5)' : 'rgba(255,255,255,.12)',
      bg: on ? 'rgba(124,230,255,.12)' : 'rgba(255,255,255,.035)',
      color: on ? '#cdf2ff' : 'rgba(233,235,242,.7)'
    });

    const artBox = (children: React.ReactNode, style?: React.CSSProperties) => React.createElement('div', { style: Object.assign({ width: '100%', height: '110px', display: 'flex', alignItems: 'center', justifyContent: 'center' }, style || {}) }, children);
    const line = (w: string, o: number) => React.createElement('span', { key: `${w}-${o}`, style: { display: 'block', width: w, height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,' + o + ')' } });

    const chapterInput = [
      { n: 'F01', k: 'sketch', t: 'Sketch to website', d: 'Layout, hierarchy and spacing read from a drawing.', bg: 'linear-gradient(170deg,rgba(255,255,255,.06),rgba(255,255,255,.015))',
        art: artBox(React.createElement('div', { style: { width: '76%', padding: '12px', borderRadius: '2px', background: 'linear-gradient(178deg,#f2efe6,#e2ded1)', display: 'flex', flexDirection: 'column', gap: '7px', transform: 'rotate(-3deg)', boxShadow: '0 14px 30px rgba(0,0,0,.45)' } }, [
          React.createElement('span', { key: 'a', style: { height: '10px', border: '2px solid #55565a' } }),
          React.createElement('span', { key: 'b', style: { height: '34px', border: '2px solid #55565a' } }),
          React.createElement('div', { key: 'c', style: { display: 'flex', gap: '6px', height: '18px' } }, [1, 2, 3].map(i => React.createElement('span', { key: i, style: { flex: 1, border: '2px solid #55565a' } })))
        ])) },
      { n: 'F02', k: 'camera', t: 'Live camera mode', d: 'It builds while you draw. Sub-second, no upload step.', bg: 'linear-gradient(170deg,rgba(124,230,255,.09),rgba(255,255,255,.015))',
        art: artBox(React.createElement('div', { style: { width: '78%', aspectRatio: '4/3', borderRadius: '10px', border: '1px solid rgba(190,240,255,.35)', position: 'relative', overflow: 'hidden', background: 'rgba(255,255,255,.03)' } }, [
          React.createElement('div', { key: 'f', style: { position: 'absolute', inset: '14px', border: '1px solid rgba(190,240,255,.5)', borderRadius: '4px' } }),
          React.createElement('div', { key: 'c', style: { position: 'absolute', left: '50%', top: '50%', width: '16px', height: '16px', marginLeft: '-8px', marginTop: '-8px', borderRadius: '50%', border: '1px solid rgba(190,240,255,.8)' } })
        ])) },
      { n: 'F03', k: 'voice', t: 'Voice editing', d: '"Make the navbar transparent." Applied, not regenerated.', bg: 'linear-gradient(170deg,rgba(255,255,255,.055),rgba(255,255,255,.012))',
        art: artBox(React.createElement('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '4px', height: '54px' } }, [0, 1, 2, 3, 4, 5, 6].map(i => React.createElement('span', { key: i, style: { width: '4px', height: '100%', borderRadius: '2px', background: i % 2 ? '#a48bff' : '#7ce6ff', animation: 'bar 1s ease-in-out ' + (i * 0.1) + 's infinite' } })))) },
      { n: 'F04', k: 'text', t: 'Text editing', d: 'Sometimes typing is faster. Voice and text share context.', bg: 'linear-gradient(170deg,rgba(255,255,255,.05),rgba(255,255,255,.012))',
        art: artBox(React.createElement('div', { style: { width: '80%', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', fontFamily: "'IBM Plex Mono',monospace", fontSize: '11px', color: 'rgba(196,236,255,.9)' } }, 'tighten the footer▎')) },
      { n: 'F05', k: 'handwriting', t: 'Handwriting', d: 'Margin notes become palette, radius and density rules.', bg: 'linear-gradient(170deg,rgba(255,255,255,.06),rgba(255,255,255,.015))',
        art: artBox(React.createElement('div', { style: { fontFamily: "'Caveat',cursive", fontSize: '22px', color: '#cfe4ff', display: 'flex', flexDirection: 'column', gap: '2px', transform: 'rotate(-3deg)' } }, [
          React.createElement('span', { key: 'a' }, 'glass effect'),
          React.createElement('span', { key: 'b', style: { color: '#9fd8ff' } }, 'rounded cards'),
          React.createElement('span', { key: 'c', style: { color: '#c9a7ff' } }, 'blue gradient')
        ])) },
      { n: 'F17', k: 'screenshot', t: 'Screenshot to site', d: 'Any screenshot, rebuilt as clean responsive code.', bg: 'linear-gradient(170deg,rgba(124,230,255,.07),rgba(255,255,255,.015))',
        art: artBox(React.createElement('div', { style: { width: '80%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } }, [
          React.createElement('div', { key: 'a', style: { height: '68px', borderRadius: '6px', background: 'repeating-linear-gradient(128deg,rgba(255,255,255,.08) 0 7px,rgba(255,255,255,.02) 7px 14px)' } }),
          React.createElement('div', { key: 'b', style: { height: '68px', borderRadius: '6px', border: '1px solid rgba(190,240,255,.3)', background: 'rgba(124,230,255,.09)', padding: '8px', display: 'flex', flexDirection: 'column', gap: '5px' } }, [line('70%', .3), line('45%', .18), line('55%', .18)])
        ])) },
      { n: 'F18', k: 'pdf', t: 'PDF to website', d: 'Brochures, decks and proposals become responsive pages.', bg: 'linear-gradient(170deg,rgba(255,255,255,.05),rgba(255,255,255,.012))',
        art: artBox(React.createElement('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
          React.createElement('div', { key: 'a', style: { width: '52px', height: '68px', borderRadius: '3px', background: '#efece3', display: 'flex', alignItems: 'flex-end', padding: '6px', fontFamily: "'IBM Plex Mono',monospace", fontSize: '8px', color: '#5a5b5f' } }, 'PDF'),
          React.createElement('span', { key: 'b', style: { fontFamily: "'IBM Plex Mono',monospace", color: 'rgba(124,230,255,.8)', fontSize: '12px' } }, '→'),
          React.createElement('div', { key: 'c', style: { width: '84px', height: '58px', borderRadius: '6px', border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.04)', padding: '7px', display: 'flex', flexDirection: 'column', gap: '5px' } }, [line('80%', .28), line('55%', .16)])
        ])) },
      { n: 'F19', k: 'whiteboard', t: 'Whiteboard mode', d: 'One photo of the meeting room wall. Arrows included.', bg: 'linear-gradient(170deg,rgba(164,139,255,.08),rgba(255,255,255,.015))',
        art: artBox(React.createElement('div', { style: { width: '82%', height: '76px', borderRadius: '6px', background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.14)', position: 'relative' } }, [
          React.createElement('span', { key: 'a', style: { position: 'absolute', left: '12%', top: '22%', width: '26%', height: '46%', border: '2px solid rgba(233,235,242,.5)' } }),
          React.createElement('span', { key: 'b', style: { position: 'absolute', right: '12%', top: '22%', width: '26%', height: '46%', border: '2px solid rgba(233,235,242,.5)' } }),
          React.createElement('span', { key: 'c', style: { position: 'absolute', left: '42%', top: '48%', width: '16%', height: '2px', background: 'rgba(190,240,255,.8)' } })
        ])) }
    ];

    const chapterUnderstand = [
      { n: 'F06', t: 'Intent understanding', d: 'Three boxes in a row is a question, not an answer. It asks whether you meant pricing or features, then commits.', k: 'behaves like · a designer' },
      { n: 'F07', t: 'AI design mentor', d: 'Critique with reasons: hierarchy, CTA placement, rhythm, contrast — each suggestion explained in a sentence you can argue with.', k: 'output · design score' },
      { n: 'F09', t: 'Component intelligence', d: 'Repeated elements are detected and lifted into typed, reusable components with sane prop names.', k: '8 components · 0 duplicates' },
      { n: 'F11', t: 'Flow detection', d: 'Login → dashboard → settings → checkout. It builds the journey, not a pile of disconnected pages.', k: 'journey · inferred' },
      { n: 'F23', t: 'AI UX simulator', d: 'Synthetic users walk the page before real ones do: heatmaps, dead clicks, scroll depth, attention, bounce prediction.', k: 'pre-launch · simulation' },
      { n: 'F24', t: 'Accessibility engine', d: 'Contrast, keyboard order, alt text, screen-reader semantics, colour-blind modes and a WCAG score — with plain-language fixes.', k: 'WCAG · AA by default' },
      { n: 'F25', t: 'SEO intelligence', d: 'Meta, Open Graph, Twitter cards, schema markup and performance notes generated alongside the build.', k: 'schema · auto' }
    ];

    const chapterBuild = [
      { n: 'F08', t: 'Style engine', d: 'Swap the whole visual language in one click. Structure, copy and components stay exactly where they are.', k: '5 systems\n0 relayout', bg: 'rgba(255,255,255,.03)' },
      { n: 'F10', t: 'Multi-page understanding', d: 'Hand it five sketches. It links them, builds navigation and keeps one design system across every page.', k: 'pages\nunlimited', bg: 'rgba(255,255,255,.025)' },
      { n: 'F12', t: 'Live preview', d: 'Every edit lands instantly on the running tree. No loading state, no regeneration.', k: 'edit → paint\n<16ms', bg: 'rgba(124,230,255,.07)' },
      { n: 'F13', t: 'Responsive AI', d: 'Desktop, tablet and mobile generated together and kept in sync as you edit.', k: '3 viewports\nsynced', bg: 'rgba(255,255,255,.025)' },
      { n: 'F26', t: 'Live conversational editing', d: 'The conversation is the editor. Context is preserved across days, not just messages.', k: 'context\npersistent', bg: 'rgba(164,139,255,.07)' }
    ];

    const chapterProduct = [
      { n: 'F14', t: 'One-click deployment', d: 'Vercel, Netlify, Cloudflare Pages or GitHub Pages. Live in one action.' },
      { n: 'F15', t: 'Export anywhere', d: 'Nine targets, from Next.js to Flutter. No runtime lock-in.' },
      { n: 'F16', t: 'Project memory', d: 'Come back in a fortnight and continue mid-sentence.' },
      { n: 'F22', t: 'Collaborative canvas', d: 'Founder, designer, PM and engineer — merged into one project.' }
    ];

    const tree = [
      { t: '▾ app/', pad: '0px', color: 'rgba(233,235,242,.85)' },
      { t: '▾ (site)/', pad: '14px', color: 'rgba(233,235,242,.7)' },
      { t: 'page.tsx', pad: '28px', color: 'rgba(196,236,255,.9)' },
      { t: 'pricing/page.tsx', pad: '28px', color: 'rgba(233,235,242,.6)' },
      { t: '▾ components/', pad: '14px', color: 'rgba(233,235,242,.7)' },
      { t: 'Nav.tsx', pad: '28px', color: 'rgba(233,235,242,.6)' },
      { t: 'Hero.tsx', pad: '28px', color: 'rgba(233,235,242,.6)' },
      { t: 'Card.tsx  ×3', pad: '28px', color: 'rgba(164,139,255,.85)' }
    ];

    return {

      hpLabel: ['sketch received', 'scanning', 'intent resolved', 'assembling', 'production ready'][Math.min(4, S.detect)],
      detections,

      heroCards: [
        { k: 'C01', t: 'Residential', d: 'Nine houses, mostly timber.' },
        { k: 'C02', t: 'Cultural', d: 'A concert hall in Aarhus.' },
        { k: 'C03', t: 'Interiors', d: 'Glass, oak and quiet light.' }
      ],

      telemetry: [
        { k: 'Median time to first site', v: '38 sec' },
        { k: 'Inputs understood', v: '8 modes' },
        { k: 'Regenerations required', v: 'zero' },
        { k: 'Export targets', v: '9' }
      ],

      triad: [
        { k: 'IDEA', t: 'It starts on paper.', d: 'A napkin, a whiteboard, a page torn from a notebook. The medium people actually think in — not a text field with a blinking cursor.', dot: '#8fe6ff', label: 'rgba(143,230,255,.9)' },
        { k: 'INTELLIGENCE', t: 'It is read, not guessed.', d: 'Structure, hierarchy, handwriting and intent are resolved into a design decision — and when it is unsure, it asks one question instead of hallucinating five.', dot: '#a48bff', label: 'rgba(164,139,255,.9)' },
        { k: 'PRODUCT', t: 'It ends as software.', d: 'Typed components, routing, responsive rules, accessibility and a deploy button. Then you keep talking to it.', dot: '#e9ebf2', label: 'rgba(233,235,242,.75)' }
      ],

      steps, stepReadout: 'STEP 0' + (S.step + 1) + ' / 06',
      stageTitle: cur.title, stageMeta: cur.meta, stageLog: cur.log,
      stageSketch: S.step === 0 || S.step === 1 ? 1 : 0,
      stageScan: S.step === 1 || S.step === 3 ? 1 : 0,
      stageSite: S.step >= 4 ? 1 : 0,
      stageWave: S.step === 2 ? 1 : 0,
      stageBg: S.step >= 4 ? 'linear-gradient(160deg,rgba(124,230,255,.12),rgba(164,139,255,.08))' : 'rgba(255,255,255,.03)',
      stageBorder: S.step >= 4 ? 'rgba(124,230,255,.4)' : 'rgba(255,255,255,.1)',

      inputChips: ['paper_sketch.jpg', 'note: "3 cards"', 'voice: 4s', 'camera: live'],
      events, eventFooter: 'no chain-of-thought · events only',
      devices, deviceW: devWidths[S.device],
      outCards: [
        { k: 'PLAN 01', p: '$0', per: 'per month', d: 'Studio visit and a coffee.', border: 'rgba(255,255,255,.08)', bg: 'rgba(255,255,255,.035)', tag: 'rgba(233,235,242,.4)' },
        { k: 'PLAN 02', p: '$2.4k', per: 'per project', d: 'Concept, drawings, permits.', border: 'rgba(124,230,255,.4)', bg: 'rgba(124,230,255,.1)', tag: 'rgba(190,240,255,.9)' },
        { k: 'PLAN 03', p: '$8k', per: 'per project', d: 'Full build supervision.', border: 'rgba(255,255,255,.08)', bg: 'rgba(255,255,255,.035)', tag: 'rgba(233,235,242,.4)' }
      ],

      voiceLog, voiceSteps, voiceTyping: S.voice,
      vsBg: vsn.bg, vsBadge: vsn.badge, vsPad: vsn.pad, vsGap: vsn.gap,
      vsRadius: vsn.radius, vsCardBg: vsn.cardBg, vsCardBorder: vsn.cardBorder, vsBlur: vsn.blur,
      vsCards: [
        { k: 'S01', t: 'Residential', d: 'Nine houses, mostly timber.' },
        { k: 'S02', t: 'Cultural', d: 'A concert hall in Aarhus.' },
        { k: 'S03', t: 'Interiors', d: 'Glass, oak, quiet light.' }
      ],

      chapterInput, chapterUnderstand, chapterBuild, chapterProduct, tree,
      exportTargets: ['React', 'Next.js', 'HTML', 'Tailwind', 'Vue', 'Angular', 'Flutter', 'React Native', 'WordPress'],

      scores: [
        { t: 'Visual hierarchy', v: '96', w: '96%' },
        { t: 'Contrast (WCAG)', v: '97', w: '97%' },
        { t: 'CTA placement', v: '88', w: '88%' },
        { t: 'Spacing rhythm', v: '92', w: '92%' },
        { t: 'Motion restraint', v: '90', w: '90%' }
      ],

      productOffers: [
        pill('Interactive 3D viewer', true), pill('Product gallery', true), pill('Specifications table', true),
        pill('Buy button', false), pill('Reviews', false), pill('Colour variants', true),
        pill('Comparison table', false), pill('Related products', false)
      ],

      uxMetrics: [
        { t: 'Attention on primary CTA', v: '78%', w: '78%' },
        { t: 'Scroll depth (median)', v: '64%', w: '64%' },
        { t: 'Predicted conversion', v: '4.9%', w: '49%' },
        { t: 'Accessibility score', v: '97', w: '97%' },
        { t: 'Predicted bounce', v: '31%', w: '31%' }
      ],

      navItems: [
        { t: 'Projects', c: '12', color: 'rgba(233,235,242,.66)', bg: 'transparent' },
        { t: 'Dashboard', c: '', color: 'rgba(233,235,242,.66)', bg: 'transparent' },
        { t: 'Components', c: '38', color: '#eaf7ff', bg: 'rgba(124,230,255,.11)' },
        { t: 'Assets', c: '96', color: 'rgba(233,235,242,.66)', bg: 'transparent' },
        { t: 'AI Assistant', c: '', color: 'rgba(233,235,242,.66)', bg: 'transparent' },
        { t: 'Deployments', c: '4', color: 'rgba(233,235,242,.66)', bg: 'transparent' },
        { t: 'Exports', c: '', color: 'rgba(233,235,242,.66)', bg: 'transparent' },
        { t: 'History', c: '', color: 'rgba(233,235,242,.66)', bg: 'transparent' },
        { t: 'Settings', c: '', color: 'rgba(233,235,242,.66)', bg: 'transparent' }
      ],

      memory: [
        { d: '12d', t: 'Kyoto page paused mid-edit' },
        { d: '4d', t: 'Palette changed to warm grey' },
        { d: '2h', t: 'Pricing detected from sketch' }
      ],

      dock: [
        { t: 'Camera', dot: '#7ce6ff' }, { t: 'Sketch', dot: '#a48bff' }, { t: 'Voice', dot: '#7ce6ff' },
        { t: 'Screenshot', dot: '#a48bff' }, { t: 'PDF', dot: '#7ce6ff' }, { t: 'Text', dot: '#a48bff' }
      ],

      wsEvents: [
        { mark: '▶', t: 'detected navigation · 5 items', color: 'rgba(196,236,255,.92)' },
        { mark: '·', t: 'mapped hero section', color: 'rgba(233,235,242,.55)' },
        { mark: '·', t: 'created responsive grid · 3 col', color: 'rgba(233,235,242,.55)' },
        { mark: '·', t: 'applied voice instruction', color: 'rgba(233,235,242,.55)' },
        { mark: '·', t: 'updated 3 components', color: 'rgba(233,235,242,.55)' },
        { mark: '·', t: 'a11y pass · AA', color: 'rgba(233,235,242,.4)' }
      ],

      chat: [
        { t: 'Three cards under the hero — pricing or features?', align: 'flex-start', border: 'rgba(255,255,255,.1)', bg: 'rgba(255,255,255,.045)', color: 'rgba(233,235,242,.85)' },
        { t: 'Features. And make the hero taller.', align: 'flex-end', border: 'rgba(124,230,255,.4)', bg: 'rgba(124,230,255,.12)', color: '#e9f8ff' },
        { t: 'Done — 82vh. Design score 91 → 94.', align: 'flex-start', border: 'rgba(164,139,255,.32)', bg: 'rgba(164,139,255,.1)', color: '#efeaff' }
      ],

      oldFlow: [
        { t: 'Idea', k: 'you', dot: 'rgba(233,235,242,.5)', color: 'rgba(233,235,242,.8)' },
        { t: 'Write the prompt', k: '6 min', dot: 'rgba(255,150,140,.7)', color: 'rgba(233,235,242,.62)' },
        { t: 'Generate', k: '40 sec', dot: 'rgba(233,235,242,.3)', color: 'rgba(233,235,242,.62)' },
        { t: 'It is nearly right', k: 'again', dot: 'rgba(255,150,140,.7)', color: 'rgba(233,235,242,.62)' },
        { t: 'Regenerate — lose your edits', k: 'again', dot: 'rgba(255,150,140,.7)', color: 'rgba(233,235,242,.62)' },
        { t: 'Open the code', k: 'dev', dot: 'rgba(233,235,242,.3)', color: 'rgba(233,235,242,.62)' },
        { t: 'Fix the design by hand', k: 'designer', dot: 'rgba(233,235,242,.3)', color: 'rgba(233,235,242,.62)' }
      ],

      newFlow: [
        { t: 'Idea', k: 'you' },
        { t: 'Show it — paper, camera, PDF', k: '4 sec' },
        { t: 'It reads intent and asks once', k: '1 tap' },
        { t: 'Live website', k: '38 sec' },
        { t: 'Speak the changes', k: 'live' },
        { t: 'Ship', k: '1 click' }
      ],

      uniqueCaps: ['Hand-drawn sketch input', 'Live camera build', 'Voice editing', 'Handwriting recognition', 'Intent clarification', 'Product & 3D intelligence'],

      era: [
        { y: '2024', t: 'Prompt-based AI', d: 'You describe, it guesses, you describe again. The interface is a text box and the skill is phrasing.', dot: 'rgba(233,235,242,.3)', year: 'rgba(233,235,242,.34)' },
        { y: '2025', t: 'Visual AI', d: 'Images go in and layouts come out. Structure without meaning — shapes recognised, intent missed.', dot: 'rgba(233,235,242,.5)', year: 'rgba(233,235,242,.5)' },
        { y: '2026', t: 'Multimodal AI', d: 'Draw, show, speak and scribble — together, in one session, with memory. This is where Orbital lives.', dot: '#8fe6ff', year: '#bdf1ff' },
        { y: 'Next', t: 'Intent-driven software', d: 'You describe the outcome. It builds the product, argues with you about it, and keeps it honest.', dot: '#a48bff', year: 'rgba(164,139,255,.95)' }
      ],

      plans: [
        { name: 'Sketch', tag: 'FREE', tagColor: 'rgba(233,235,242,.4)', price: '$0', per: 'forever', bg: 'transparent', cta: 'Start free', ctaBorder: 'rgba(255,255,255,.14)', ctaBg: 'rgba(255,255,255,.045)', ctaColor: '#e9ebf2',
          items: [{ k: 'PROJECTS', v: '3 projects' }, { k: 'INPUT', v: 'Sketch, text' }, { k: 'AI', v: 'Standard reasoning' }, { k: 'SHIP', v: 'HTML export' }] },
        { name: 'Studio', tag: 'MOST PICKED', tagColor: '#bdf1ff', price: '$29', per: 'per month', bg: 'linear-gradient(170deg,rgba(124,230,255,.1),rgba(255,255,255,.015))', cta: 'Start 14-day trial', ctaBorder: 'transparent', ctaBg: 'linear-gradient(180deg,#cdf3ff,#7ad6ff)', ctaColor: '#04060c',
          items: [{ k: 'PROJECTS', v: 'Unlimited' }, { k: 'INPUT', v: 'All eight modes' }, { k: 'AI', v: 'Mentor, style engine, 3D' }, { k: 'SHIP', v: 'Nine export targets, deploy' }] },
        { name: 'Orbit', tag: 'TEAMS', tagColor: 'rgba(164,139,255,.9)', price: '$89', per: 'per seat / month', bg: 'linear-gradient(170deg,rgba(164,139,255,.09),rgba(255,255,255,.015))', cta: 'Talk to us', ctaBorder: 'rgba(255,255,255,.14)', ctaBg: 'rgba(255,255,255,.045)', ctaColor: '#e9ebf2',
          items: [{ k: 'PROJECTS', v: 'Shared workspaces' }, { k: 'INPUT', v: 'Collaborative canvas' }, { k: 'AI', v: 'UX simulator, SEO, memory' }, { k: 'SHIP', v: 'SSO, audit log, private cloud' }] }
      ],

      faq, faqQ: faqData[S.faq].q, faqA: faqData[S.faq].a, faqTag: 'ANSWER 0' + (S.faq + 1)
    };
  }

  render() {
    return <Template v={this.renderVals()} {...this.nodeRefs} />;
  }
}

export default OrbitalLanding;
