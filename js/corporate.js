"use strict";

document.documentElement.classList.add("js");

const corporateLocalRuntime = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
  ? (window.KRIDIYA_LOCAL_SUPABASE || {
      url: "http://127.0.0.1:57421",
      publishableKey: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"
    })
  : null;

const KRIDIYA = {
  legal: "Kridiya Travel and Tourism FZ-LLC",
  site: "Kridiya Business Travel",
  mainSite: "https://www.kridiyatravel.com/",
  corporateSite: "https://corporate.kridiyatravel.com/",
  phoneDisplay: "+971 50 941 3873",
  phoneTel: "+971509413873",
  waNumber: "971509413873",
  emails: {
    corporate: "corporate@kridiyatravel.com",
    enquiry: "enquiry@kridiyatravel.com",
    info: "info@kridiyatravel.com"
  },
  social: {
    instagram: "https://www.instagram.com/kridiyatravel/",
    facebook: "https://www.facebook.com/profile.php?id=61592086520680",
    linkedin: "https://www.linkedin.com/company/kridiya-travel/"
  },
  supabaseUrl: corporateLocalRuntime?.url || "https://jmvqqpughlzeqrcyavwz.supabase.co",
  supabaseKey: corporateLocalRuntime?.publishableKey || "sb_publishable_wiA9tSt74X-UQhW4yOXgIQ_lEUG1Q1Q",
  supabaseCdn: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.js",
  supabaseIntegrity: "sha384-qafw21c/iciq0VXsi9FzkfoQv5I/V0iqE4lSNcKXPnW9/UTJLnv5CcN4FHxVLnKg"
};

const SERVICES = [
  [
    "flight",
    "Employee flight booking",
    "Flights for business trips, employee movement and planned leave."
  ],
  [
    "hotel",
    "Hotel corporate rates",
    "Accommodation for business travellers, project teams and longer stays."
  ],
  [
    "transfer",
    "Airport transfers",
    "Airport pickups and ground transport coordinated with the journey."
  ],
  [
    "visa",
    "Business visa processing",
    "Requirements, application preparation and progress coordination."
  ],
  [
    "guest",
    "UAE visit visa for company guests",
    "Visa support for visiting clients, partners and business guests."
  ],
  [
    "insurance",
    "Travel insurance",
    "Policy options and documentation for your declared travel needs."
  ],
  [
    "event",
    "Event/group travel",
    "Flights, stays and arrival coordination for travelling groups."
  ],
  [
    "mice",
    "MICE travel",
    "Travel arrangements for meetings, incentives, conferences and exhibitions."
  ],
  [
    "annual",
    "Staff annual leave travel packages",
    "Leave travel coordinated around company allowances and dates."
  ],
  [
    "vip",
    "Executive/VIP travel support",
    "Complex itineraries and specific executive travel requirements."
  ],
  [
    "emergency",
    "Emergency travel changes",
    "Urgent change requests routed to the travel desk."
  ],
  [
    "umrah",
    "Corporate Umrah groups",
    "Group travel planning for company-supported Umrah journeys."
  ],
  [
    "reward",
    "Company holiday packages/reward trips",
    "Employee reward journeys and company holiday programmes."
  ],
  [
    "report",
    "Monthly travel activity report",
    "Company travel activity with source references for review."
  ]
];

function waLink(message) {
  return "https://wa.me/" + KRIDIYA.waNumber + (message ? "?text=" + encodeURIComponent(message) : "");
}

const SOCIAL_ICONS = {
  whatsapp: "M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.4-3c-.3-.4 0-.5.2-.7l.4-.5c.1-.2.2-.3.3-.5v-.5c0-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s1 2.5 1.1 2.7c.1.2 1.9 3 4.7 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.3z",
  instagram: "M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 1.8c-3.1 0-3.5 0-4.8.1-1.1.1-1.5.2-1.9.3-.5.2-.8.4-1.1.7-.3.3-.5.6-.7 1.1-.1.4-.3.8-.3 1.9-.1 1.3-.1 1.7-.1 4.8s0 3.5.1 4.8c.1 1.1.2 1.5.3 1.9.2.5.4.8.7 1.1.3.3.6.5 1.1.7.4.1.8.3 1.9.3 1.3.1 1.7.1 4.8.1s3.5 0 4.8-.1c1.1-.1 1.5-.2 1.9-.3.5-.2.8-.4 1.1-.7.3-.3.5-.6.7-1.1.1-.4.3-.8.3-1.9.1-1.3.1-1.7.1-4.8s0-3.5-.1-4.8c-.1-1.1-.2-1.5-.3-1.9-.2-.5-.4-.8-.7-1.1-.3-.3-.6-.5-1.1-.7-.4-.1-.8-.3-1.9-.3-1.3-.1-1.7-.1-4.8-.1zm0 3.1a5 5 0 1 1 0 9.9 5 5 0 0 1 0-9.9zm0 1.8a3.1 3.1 0 1 0 0 6.3 3.1 3.1 0 0 0 0-6.3zm5.1-2.2a1.2 1.2 0 1 1 0 2.3 1.2 1.2 0 0 1 0-2.3z",
  facebook: "M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12z",
  linkedin: "M6.5 8.3H3.2V19h3.3V8.3zM4.9 3a1.9 1.9 0 1 0 0 3.8A1.9 1.9 0 0 0 4.9 3zm14 9.9c0-3.2-1.7-4.9-4.1-4.9-1.9 0-2.8 1-3.2 1.8V8.3H8.3V19h3.3v-5.3c0-1.4.3-2.8 2-2.8 1.7 0 1.7 1.6 1.7 2.9V19h3.3l.3-6.1z"
};

function socialIcon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${SOCIAL_ICONS[name]}"></path></svg>`;
}

function pageName() {
  const p = location.pathname.split("/").pop();
  return p || "index.html";
}

function renderChrome() {
  if (document.body.dataset.privatePortal === "true") return;
  document.body.classList.add("biz-site");
  const current = pageName();
  const header = document.getElementById("site-header");
  const groups = [
    ["Solutions", "solutions.html", [
      ["Managed business travel", "solution-managed.html"],
      ["Employee movement", "solution-workforce.html"],
      ["Project & field teams", "solution-project.html"],
      ["Company guests", "solution-guests.html"],
      ["Meetings & events", "solution-events.html"],
      ["Executive travel", "solution-executive.html"],
      ["Finance & procurement", "solution-finance.html"],
      ["View all solutions", "solutions.html"]
    ]],
    ["Services", "services.html", SERVICES.map((s) => [s[1], "service-" + s[0] + ".html"])],
    ["Platform", "platform.html", [
      ["Company workspace", "platform.html"],
      ["Requests & approvals", "platform.html#requests"],
      ["People & company profiles", "platform.html#people"],
      ["Documents & finance", "platform.html#finance"],
      ["How it works", "how-it-works.html"]
    ]],
    ["Resources", "resources.html", [
      ["Help centre", "help.html"],
      ["Getting started", "resources.html#onboarding"],
      ["Prepare a travel request", "resources.html#request"],
      ["Billing & LPO guide", "resources.html#billing"],
      ["Changes & documents", "resources.html#changes"]
    ]],
    ["Company", "about.html", [
      ["About Kridiya", "about.html"],
      ["Apply for a company account", "company.html"],
      ["Contact the desk", "contact.html"],
      ["Main Kridiya website", KRIDIYA.mainSite]
    ]]
  ];
  if (header) {
    header.classList.add("biz-header");
    header.innerHTML = `
      <a class="biz-skip" href="#main-content">Skip to content</a>
      <div class="biz-utility"><div class="container"><span>Kridiya Business Travel <span class="biz-utility-divider">/</span> UAE & international</span><a href="tel:${KRIDIYA.phoneTel}">Corporate desk · ${KRIDIYA.phoneDisplay}</a></div></div>
      <div class="container biz-header-row">
        <a class="biz-brand" href="index.html" aria-label="Kridiya Business Travel home"><img src="assets/logo.png" alt="Kridiya Travel and Tourism" width="1660" height="947"><span>Business<span>Travel</span></span></a>
        <button class="biz-menu-toggle" type="button" aria-controls="biz-navigation" aria-expanded="false">Menu <span aria-hidden="true">☰</span></button>
        <nav id="biz-navigation" class="biz-nav" aria-label="Main navigation">
          <ul>${groups.map(([label, overview, links], index) => `<li class="biz-nav-group"><button type="button" class="biz-nav-trigger" aria-expanded="false" aria-controls="biz-menu-${index}"${current === overview || (label === "Services" && current.startsWith("service-")) || (label === "Solutions" && current.startsWith("solution-")) ? ' data-current="true"' : ""}>${label}</button><div class="biz-dropdown t-dropdown" data-origin="top-center" id="biz-menu-${index}" hidden inert><div class="biz-menu-intro"><span class="biz-eyebrow">${label}</span><p>${label === "Services" ? "Flights, hotels, visas and transfers." : label === "Solutions" ? "Travel for employees, guests and project teams." : label === "Platform" ? "Requests, quotes, bookings and travel documents." : label === "Resources" ? "Account, payment and travel preparation guides." : "About Kridiya and how to reach us."}</p><a href="${overview}">Explore ${label.toLowerCase()} <span aria-hidden="true">↗</span></a></div><div class="biz-menu-links">${links.map(([text, href]) => `<a href="${href}"${href === current ? ' aria-current="page"' : ""}>${text}<span aria-hidden="true">↗</span></a>`).join("")}</div></div></li>`).join("")}</ul>
          <div class="biz-mobile-actions"><a href="login.html?next=corporate-account.html">Client sign in</a><a class="btn btn-primary" href="company.html#setup">Apply for an account</a></div>
        </nav>
        <div class="biz-header-actions"><a href="login.html?next=corporate-account.html">Sign in</a><a class="btn btn-primary" href="company.html#setup">Apply for an account <span aria-hidden="true">↗</span></a></div>
      </div>`;
    const main = document.querySelector("main");
    if (main && !main.id) main.id = "main-content";
    const nav = header.querySelector(".biz-nav");
    const mobileToggle = header.querySelector(".biz-menu-toggle");
    const triggers = Array.from(header.querySelectorAll(".biz-nav-trigger"));
    const desktopNavigation = window.matchMedia("(min-width: 1081px)");
    function setDropdown(trigger, open, options = {}) {
      const menu = document.getElementById(trigger.getAttribute("aria-controls"));
      trigger.setAttribute("aria-expanded", String(open));
      if (window.KridiyaMotion) window.KridiyaMotion[open ? "show" : "hide"](menu, options);
      else {
        menu.hidden = !open;
        menu.inert = !open;
        menu.classList.toggle("is-open", open);
      }
    }
    function closeDropdowns(except, options = {}) {
      triggers.forEach((trigger) => {
        if (trigger !== except && (trigger.getAttribute("aria-expanded") === "true" || options.instant)) {
          setDropdown(trigger, false, options);
        }
      });
    }
    function closeMobile(options = {}) {
      mobileToggle.setAttribute("aria-expanded", "false");
      nav.classList.remove("is-open");
      document.body.classList.remove("biz-menu-open");
      // The full mobile navigation is a frequent navigation control, not an
      // overlay presentation: keep it instant and animate only its dropdowns.
      nav.hidden = !desktopNavigation.matches;
      nav.inert = !desktopNavigation.matches;
      closeDropdowns(null, { ...options, instant: options.instant || !desktopNavigation.matches });
    }
    triggers.forEach((trigger) => {
      trigger.addEventListener("click", (event) => {
        const opening = trigger.getAttribute("aria-expanded") !== "true";
        const options = { instant: event.detail === 0 };
        closeDropdowns(trigger, options);
        setDropdown(trigger, opening, options);
      });
      trigger.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowDown") return;
        event.preventDefault();
        closeDropdowns(trigger, { instant: true });
        setDropdown(trigger, true, { instant: true });
        const menu = document.getElementById(trigger.getAttribute("aria-controls"));
        Array.from(menu.querySelectorAll("a")).find((link) => link.getClientRects().length)?.focus();
      });
    });
    mobileToggle.addEventListener("click", () => {
      const open = mobileToggle.getAttribute("aria-expanded") !== "true";
      if (!open) closeMobile();
      else {
        nav.hidden = false;
        nav.inert = false;
        nav.classList.add("is-open");
        mobileToggle.setAttribute("aria-expanded", "true");
        document.body.classList.add("biz-menu-open");
      }
    });
    header.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const active = triggers.find((trigger) => trigger.getAttribute("aria-expanded") === "true");
      if (active) { event.preventDefault(); closeDropdowns(null, { instant: true }); active.focus(); }
      else if (mobileToggle.getAttribute("aria-expanded") === "true") { event.preventDefault(); closeMobile({ instant: true }); mobileToggle.focus(); }
    });
    document.addEventListener("click", (event) => { if (!header.contains(event.target)) closeMobile(); });
    header.addEventListener("focusout", (event) => {
      // Close only when focus actually moves to another page control. A window
      // blur (including browser tooling or switching tabs) has no related target.
      if (event.relatedTarget && !header.contains(event.relatedTarget)) closeMobile();
    });
    nav.addEventListener("click", (event) => { if (event.target.closest("a")) closeMobile(); });
    desktopNavigation.addEventListener("change", () => {
      const focusInNav = nav.contains(document.activeElement);
      closeMobile({ instant: true });
      if (focusInNav && !desktopNavigation.matches) mobileToggle.focus();
    });
    closeMobile({ instant: true });
  }
  const footer = document.getElementById("site-footer");
  if (footer) {
    footer.classList.add("biz-footer");
    footer.innerHTML = `
      <div class="container biz-footer-top"><div><a class="biz-brand" href="index.html" aria-label="Kridiya Business Travel home"><img src="assets/logo.png" alt="Kridiya Travel and Tourism" width="1660" height="947"><span>Business<span>Travel</span></span></a><p>Company travel. Personally handled.</p><a href="mailto:${KRIDIYA.emails.corporate}">${KRIDIYA.emails.corporate}</a><br><a href="tel:${KRIDIYA.phoneTel}">${KRIDIYA.phoneDisplay}</a><div class="biz-footer-social" aria-label="Kridiya social channels"><a href="${waLink()}" target="_blank" rel="noopener" aria-label="WhatsApp">${socialIcon("whatsapp")}</a><a href="${KRIDIYA.social.facebook}" target="_blank" rel="noopener" aria-label="Facebook">${socialIcon("facebook")}</a><a href="${KRIDIYA.social.instagram}" target="_blank" rel="noopener" aria-label="Instagram">${socialIcon("instagram")}</a><a href="${KRIDIYA.social.linkedin}" target="_blank" rel="noopener" aria-label="LinkedIn">${socialIcon("linkedin")}</a></div></div>
      <div><h2>Travel with us</h2><a href="solutions.html">Solutions</a><a href="services.html">All services</a><a href="booking.html">Request travel</a><a href="company.html#setup">Apply for an account</a></div>
      <div><h2>Your workspace</h2><a href="platform.html">Platform</a><a href="login.html?next=corporate-account.html">Client sign in</a><a href="how-it-works.html">How it works</a><a href="resources.html#billing">Billing & LPO</a></div>
      <div><h2>Here to help</h2><a href="help.html">Help centre</a><a href="contact.html">Corporate desk</a><a href="about.html">About Kridiya</a><a href="${KRIDIYA.mainSite}">Main website ↗</a></div></div>
      <div class="container biz-footer-bottom"><span>© ${new Date().getFullYear()} ${KRIDIYA.legal}</span><div><a href="privacy.html">Privacy</a><a href="terms.html">Service information</a><a href="accessibility.html">Accessibility</a></div></div>`;
  }
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function setFieldError(input, message) {
  const field = input.closest(".field");
  if (!field) return;
  let error = field.querySelector(".err");
  if (!error) {
    error = document.createElement("span");
    error.className = "err";
    error.id = (input.id || input.name) + "-error";
    field.append(error);
  }
  const descriptions = new Set((input.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
  if (message) descriptions.add(error.id);
  else descriptions.delete(error.id);
  if (descriptions.size) input.setAttribute("aria-describedby", [...descriptions].join(" "));
  else input.removeAttribute("aria-describedby");
  input.setAttribute("aria-invalid", String(Boolean(message)));
  field.classList.toggle("invalid", Boolean(message));
  error.textContent = message || "";
}

function validateForm(form) {
  let first = null;
  form.querySelectorAll("input, select, textarea").forEach((input) => {
    if (input.matches(":disabled") || input.type === "hidden") return;
    const value = input.value.trim();
    let message = "";
    if (input.required && !value) message = "This field is required.";
    else if (value && input.type === "email" && !RE_EMAIL.test(value)) message = "Enter a valid email address.";
    else if (value && input.minLength > 0 && value.length < input.minLength) message = "Enter at least " + input.minLength + " characters.";
    else if (value && input.maxLength > 0 && value.length > input.maxLength) message = "Keep this under " + input.maxLength + " characters.";
    else if (input.validity.badInput || input.validity.rangeUnderflow || input.validity.rangeOverflow || input.validity.stepMismatch) message = "Enter a valid value within the allowed range.";
    setFieldError(input, message);
    if (message && !first) first = input;
  });
  const departure = form.elements.namedItem("Preferred_date");
  const returning = form.elements.namedItem("Return_date");
  if (departure?.value && returning?.value && !departure.matches(":disabled") && !returning.matches(":disabled") && returning.value < departure.value) {
    setFieldError(returning, "The end date must be on or after the start date.");
    first ||= returning;
  }
  first?.focus();
  return !first;
}

function reference(prefix) {
  const random = crypto.getRandomValues(new Uint8Array(8));
  return "KD-" + prefix + "-" + new Date().getFullYear() + "-" +
    Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function enquiryPayload(form, ref) {
  const details = {};
  new FormData(form).forEach((value, key) => {
    if (!key.startsWith("_")) details[key] = String(value).trim();
  });
  details.Message = details.Message || details.Notes || details.Travel_policy ||
    [details.Request_type, details.Service_needed, details.Destination, details.Company_name].filter(Boolean).join(" - ");
  const summaryType = details.Request_type === "Corporate account setup"
    ? details.Request_type : details.Service_needed || details.Request_type || "Corporate business travel";
  if (new TextEncoder().encode(JSON.stringify(details)).length > 30000) {
    throw new Error("FORM_TOO_LARGE");
  }
  return {
    reference: ref,
    service_type: "other",
    full_name: details.Contact_person || details.Name || details.Authorized_contact,
    email: details.Email || details.Company_email,
    phone: details.Phone || null,
    summary: summaryType + " - " + (details.Company_name || "Company pending"),
    details
  };
}

let publicClientPromise = null;
async function supabaseClient() {
  if (publicClientPromise) return publicClientPromise;
  publicClientPromise = (async () => {
    if (!window.supabase?.createClient) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        const timer = setTimeout(() => finish(new Error("SDK_TIMEOUT")), 12000);
        function finish(error) {
          clearTimeout(timer);
          script.onload = script.onerror = null;
          if (error) { script.remove(); reject(error); }
          else resolve();
        }
        script.src = KRIDIYA.supabaseCdn;
        script.integrity = KRIDIYA.supabaseIntegrity;
        script.crossOrigin = "anonymous";
        script.dataset.supabaseJs = "true";
        script.onload = () => finish(window.supabase?.createClient ? null : new Error("SDK_UNAVAILABLE"));
        script.onerror = () => finish(new Error("SDK_UNAVAILABLE"));
        document.head.append(script);
      });
    }
    // Public enquiries never read, refresh or replace the company portal session.
    return window.supabase.createClient(KRIDIYA.supabaseUrl, KRIDIYA.supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: "kridiya-public-enquiry"
      }
    });
  })();
  try { return await publicClientPromise; }
  catch (error) { publicClientPromise = null; throw error; }
}

async function sendToSupabase(payload) {
  const sb = await supabaseClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    let request = sb.from("enquiries").insert(payload);
    if (typeof request.abortSignal === "function") request = request.abortSignal(controller.signal);
    const result = await request;
    if (result.error) throw result.error;
    if (typeof result.status === "number" && (result.status < 200 || result.status >= 300)) {
      throw new Error("ENQUIRY_NOT_SAVED");
    }
  } finally { clearTimeout(timer); }
}

async function sendFormSubmit(payload) {
  if (corporateLocalRuntime) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch("https://formsubmit.co/ajax/" + KRIDIYA.emails.corporate, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        Reference: payload.reference,
        Message: "A corporate enquiry was saved. Open this reference in the staff system."
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error("NOTIFICATION_NOT_SENT");
  } finally { clearTimeout(timer); }
}

function renderFormStatus(status, messages) {
  if (!status) return;
  status.replaceChildren(...messages.map(([kind, text]) => {
    const banner = document.createElement("div");
    banner.className = "form-banner " + kind;
    banner.textContent = text;
    return banner;
  }));
}

function prepareForms() {
  document.querySelectorAll("form[data-corporate-form]").forEach((form) => {
    let sending = false;
    let pendingReference = null;
    form.addEventListener("input", (event) => {
      if (event.target.matches("input, select, textarea")) setFieldError(event.target, "");
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (sending || !validateForm(form)) return;
      const button = form.querySelector('button[type="submit"]');
      const originalLabel = button?.textContent;
      const status = form.querySelector("[data-form-status]");
      pendingReference ||= reference(form.dataset.prefix || "BIZ");
      let payload;
      try { payload = enquiryPayload(form, pendingReference); }
      catch {
        renderFormStatus(status, [["error", "Please shorten the request notes before sending."]]);
        return;
      }
      const controls = Array.from(form.elements).map((element) => [element, element.disabled]);
      sending = true;
      form.setAttribute("aria-busy", "true");
      controls.forEach(([element]) => { element.disabled = true; });
      if (button) button.textContent = "Sending…";
      renderFormStatus(status, []);
      let saved = false;
      try {
        await sendToSupabase(payload);
        saved = true;
        let notificationFailed = false;
        try { await sendFormSubmit(payload); }
        catch { notificationFailed = true; }
        const message = corporateLocalRuntime
          ? "Preview request saved in the local database with reference " + pendingReference + ". Email delivery is disabled in local preview."
          : form.dataset.successMessage
          ? form.dataset.successMessage.replace("{ref}", pendingReference)
          : "Request saved with reference " + pendingReference + ". Kridiya will contact you from " + KRIDIYA.emails.corporate + ".";
        const messages = [["success", message]];
        if (notificationFailed) messages.push(["error", "Your request is saved. If it’s urgent, contact the desk with your reference."]);
        renderFormStatus(status, messages);
        pendingReference = null;
        form.reset();
      } catch (error) {
        const message = error?.code === "23505"
          ? "This reference may already have been received. Contact the desk with " + pendingReference + " before sending another request."
          : "Could not save online. Keep reference " + pendingReference + " and contact " + KRIDIYA.emails.corporate +
            " or WhatsApp " + KRIDIYA.phoneDisplay + ". If the connection was interrupted, ask the desk to check this reference before submitting again.";
        renderFormStatus(status, [["error", message]]);
      } finally {
        controls.forEach(([element, disabled]) => { element.disabled = disabled; });
        if (button) button.textContent = originalLabel;
        form.removeAttribute("aria-busy");
        sending = false;
        if (saved) form.dispatchEvent(new CustomEvent("corporate:saved"));
      }
    });
  });
}

function prefillBookingService() {
  const select = document.querySelector('form [name="Service_needed"]');
  if (!select) return;
  const service = new URLSearchParams(location.search).get("service");
  if (!service) return;
  const matched = SERVICES.find(([id, name]) => id === service || name.toLowerCase() === service.toLowerCase());
  const candidate = matched?.[1] || service;
  const option = Array.from(select.options).find((item) => item.textContent.toLowerCase() === candidate.toLowerCase());
  if (option) select.value = option.value;
}

document.addEventListener("DOMContentLoaded", () => {
  renderChrome();
  prefillBookingService();
  prepareForms();
});
