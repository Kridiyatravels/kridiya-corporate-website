"use strict";
(() => {
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iOS || matchMedia("(prefers-reduced-motion: reduce)").matches || typeof Lenis !== "function") return;
  const lenis = new Lenis();
  const raf = time => {
    lenis.raf(time);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
})();
