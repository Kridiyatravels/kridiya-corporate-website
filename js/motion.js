"use strict";

// Transitions.dev state orchestration. Native semantics stay with each caller.
// Emil's interaction rule: keyboard and reduced-motion changes are immediate.
(() => {
  const pending = new WeakMap();
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  document.addEventListener("keydown", () => { document.documentElement.dataset.input = "keyboard"; }, true);
  document.addEventListener("pointerdown", () => { document.documentElement.dataset.input = "pointer"; }, true);
  const immediate = (options) => options?.instant || reduced.matches || document.documentElement.dataset.input === "keyboard";
  function cancel(element) {
    const timer = pending.get(element);
    if (timer) clearTimeout(timer);
    pending.delete(element);
  }
  function show(element, options = {}) {
    cancel(element);
    const instant = immediate(options);
    element.classList.toggle("motion-instant", Boolean(instant));
    element.hidden = false;
    element.inert = false;
    element.classList.remove("is-closing");
    // Flush the resting state once so the CSS transition has an entry state.
    if (!instant && !element.classList.contains("is-open")) void element.offsetWidth;
    element.classList.add("is-open");
  }
  function hide(element, options = {}) {
    cancel(element);
    element.classList.remove("is-open");
    element.inert = true;
    const finish = () => {
      pending.delete(element);
      element.classList.remove("is-closing");
      element.hidden = true;
      options.onHidden?.();
    };
    if (element.hidden || immediate(options)) { finish(); return; }
    element.classList.add("is-closing");
    const token = element.classList.contains("t-modal") ? "--modal-close-dur" : "--dropdown-close-dur";
    const value = getComputedStyle(element).getPropertyValue(token).trim();
    const duration = parseFloat(value) * (value.endsWith("ms") ? 1 : 1000);
    pending.set(element, setTimeout(finish, Number.isFinite(duration) ? duration : 150));
  }
  window.KridiyaMotion = Object.freeze({show, hide});

  function revealHero() {
    // Progressive enhancement: without JS, the entire headline remains visible.
    // Do not replay this marketing entrance on reload, back/forward or keyboard use.
    if (immediate() || performance.getEntriesByType("navigation")[0]?.type !== "navigate") return;
    const block = document.querySelector(".biz-hero-copy");
    const heading = block?.querySelector("h1");
    const supporting = block?.querySelector(".biz-lede");
    if (!heading || !supporting) return;
    block.classList.add("t-stagger");
    heading.classList.add("t-stagger-line", "t-stagger-line--1");
    supporting.classList.add("t-stagger-line", "t-stagger-line--2");
    block.classList.remove("is-hiding", "is-shown");
    void block.offsetHeight;
    block.classList.add("is-shown");
    const styles = getComputedStyle(block);
    const milliseconds = (name) => {
      const value = styles.getPropertyValue(name).trim();
      const duration = parseFloat(value) * (value.endsWith("ms") ? 1 : 1000);
      return Number.isFinite(duration) ? duration : 500;
    };
    const finish = () => {
      clearTimeout(timer);
      heading.classList.remove("t-stagger-line", "t-stagger-line--1");
      supporting.classList.remove("t-stagger-line", "t-stagger-line--2");
      block.classList.remove("t-stagger", "is-shown");
      document.removeEventListener("keydown", finish, true);
      reduced.removeEventListener("change", finish);
    };
    const timer = setTimeout(finish, milliseconds("--stagger-dur") + milliseconds("--stagger-stagger") + 50);
    document.addEventListener("keydown", finish, true);
    reduced.addEventListener("change", finish);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", revealHero, {once:true});
  else revealHero();
})();
