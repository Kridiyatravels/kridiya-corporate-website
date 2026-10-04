"use strict";
(() => {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const body = document.body;
  let scroll;
  let heroTimer;
  let finished = false;
  function finish() {
    finished = true;
    scroll?.teardown();
    clearTimeout(heroTimer);
    body.classList.remove("reveal-enabled");
    document.querySelectorAll(".heroItem").forEach(el => el.classList.remove("heroItem"));
    document.removeEventListener("keydown", finish, true);
    document.removeEventListener("focusin", finish, true);
    reduced.removeEventListener("change", finish);
  }
  function start() {
    if (reduced.matches || document.documentElement.dataset.input === "keyboard") return;
    document.addEventListener("keydown", finish, true);
    document.addEventListener("focusin", finish, true);
    reduced.addEventListener("change", finish);
    const hero = document.querySelector(".biz-hero-copy, .reference-heading > div, .biz-page-heading-copy");
    // Entrance is reserved for a fresh navigation; actions remain available.
    if (hero && performance.getEntriesByType("navigation")[0]?.type === "navigate") {
      hero.classList.add("HomeHero");
      hero.querySelectorAll("h1, .biz-lede").forEach(el => el.classList.add("heroItem"));
      heroTimer = setTimeout(() => hero.querySelectorAll(".heroItem").forEach(el => el.classList.remove("heroItem")), 650);
    }
    if (typeof ScrollOut !== "function") return;
    const candidates = [...document.querySelectorAll(".home-feature, .home-heading, .home-role, .home-intro-note, .biz-article > section, .biz-solution, .biz-service-row, .biz-feature-list article, .biz-cta-band")];
    // Never conceal a form or nest independently moving reveal blocks.
    const targets = candidates.filter(el => !el.querySelector("form") && !candidates.some(parent => parent !== el && parent.contains(el)));
    if (!targets.length || finished) return;
    targets.forEach(el => el.classList.add("fadeInUp"));
    try {
      scroll = ScrollOut({ targets, once: true, threshold: 0 });
      body.classList.add("reveal-enabled");
    } catch {
      // Content remains readable if the optional animation cannot initialize.
      finish();
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
