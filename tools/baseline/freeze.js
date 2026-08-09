// Injected before any page script runs, so the dc-runtime and the page
// component both see the stubbed globals from the moment they boot.
//
// Why this works: `support.js` uses no `setInterval` and no
// `requestAnimationFrame` (it polls with `setTimeout`, which is left alone),
// so stubbing both is invisible to the runtime but stops every animation the
// page itself drives:
//
//   setInterval             -> typewriter, event ticker, style-morph cycle,
//                              and the THREE.js load poll
//   requestAnimationFrame   -> starfield, comet, globe, and the scroll loop
//
// Each rAF loop body is invoked once directly before it schedules itself, so
// layout-affecting work still happens exactly once, deterministically.

(() => {
  window.__FROZEN__ = true;

  window.setInterval = function () {
    return 0;
  };
  window.requestAnimationFrame = function () {
    return 0;
  };
  window.cancelAnimationFrame = function () {};

  // The three background canvases paint with Math.random() star fields, a
  // randomly-spawned comet, and a WebGL globe whose rotation depends on
  // wall-clock time. None can be made deterministic cheaply, and none is part
  // of the DOM layout the port must reproduce. Hide them for pixel baselines;
  // the `live` set covers them as a human reference.
  const style = document.createElement('style');
  style.setAttribute('data-freeze', '');
  style.textContent = `
    canvas { visibility: hidden !important; }
    *, *::before, *::after {
      animation: none !important;
      transition: none !important;
      caret-color: transparent !important;
    }
    html { scroll-behavior: auto !important; }
  `;
  const attach = () => document.head && document.head.appendChild(style);
  if (document.head) attach();
  else document.addEventListener('DOMContentLoaded', attach, { once: true });
})();
