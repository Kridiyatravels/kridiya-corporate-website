"use strict";

(function () {
  const RETURN_KEY = "kridiya_corporate_auth_return";
  const PROVIDERS = { google: "Google", azure: "Microsoft" };
  const ALLOWED_METHODS = new Set(["oauth", "otp", "magiclink", "invite", "sso/saml"]);
  let settingsPromise = null;

  function read(key) {
    try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch (_) { return null; }
  }

  function write(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* Server authorization remains authoritative. */ }
  }

  function remove(key) {
    try { sessionStorage.removeItem(key); } catch (_) { /* Ignore unavailable storage. */ }
  }

  function safeTarget(value) {
    const target = String(value || "");
    if (/^corporate-invitation\.html\?token=[a-f0-9]{64}$/.test(target)) return target;
    return ["corporate-account.html", "company.html", "booking.html"].includes(target) ? target : "corporate-account.html";
  }

  function returnTarget() {
    if (document.body.dataset.page === "corporate-invitation") {
      return safeTarget("corporate-invitation.html?token=" + (new URLSearchParams(location.search).get("token") || ""));
    }
    return safeTarget(new URLSearchParams(location.search).get("next"));
  }

  function callbackURL() {
    return new URL("auth-callback.html", KridiyaAuth.publicConfiguration().siteUrl).href;
  }

  async function providerAvailability() {
    if (settingsPromise) return settingsPromise;
    settingsPromise = (async function () {
      const configuration = KridiyaAuth.publicConfiguration();
      const controller = new AbortController();
      const timer = setTimeout(function () { controller.abort(); }, 8000);
      try {
        const response = await fetch(configuration.url + "/auth/v1/settings", {
          headers: { apikey: configuration.publishableKey }, signal: controller.signal, cache: "no-store"
        });
        if (!response.ok) return { google: false, azure: false };
        const settings = await response.json();
        return {
          google: Boolean(settings.external && settings.external.google === true),
          azure: Boolean(settings.external && settings.external.azure === true)
        };
      } catch (_) {
        return { google: false, azure: false };
      } finally {
        clearTimeout(timer);
        settingsPromise = null;
      }
    })();
    return settingsPromise;
  }

  async function startOAuth(provider, target) {
    if (!Object.prototype.hasOwnProperty.call(PROVIDERS, provider)) throw new Error("Unsupported company identity provider.");
    const availability = await providerAvailability();
    if (!availability[provider]) throw new Error(PROVIDERS[provider] + " sign-in is unavailable.");
    const configuration = KridiyaAuth.publicConfiguration();
    write(RETURN_KEY, { target: safeTarget(target), at: Date.now() });
    const client = await KridiyaAuth.client();
    const options = { redirectTo: callbackURL(), skipBrowserRedirect: true };
    if (provider === "google") options.queryParams = { prompt: "select_account" };
    if (provider === "azure") options.scopes = "email openid profile";
    const result = await client.auth.signInWithOAuth({ provider: provider, options: options });
    if (result.error) throw result.error;
    const url = new URL(result.data && result.data.url || "", configuration.url);
    const expected = new URL(configuration.url);
    if (url.origin !== expected.origin || url.pathname !== "/auth/v1/authorize" || url.searchParams.get("provider") !== provider) {
      throw new Error("Could not open the secure company sign-in.");
    }
    location.assign(url.href);
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  async function requestEmailCode(email, shouldCreateUser) {
    const normalized = normalizeEmail(email);
    const client = await KridiyaAuth.client();
    const result = await client.auth.signInWithOtp({
      email: normalized,
      options: { shouldCreateUser: Boolean(shouldCreateUser), emailRedirectTo: callbackURL() }
    });
    if (result.error) throw result.error;
    return normalized;
  }

  async function verifyEmailCode(email, token) {
    const client = await KridiyaAuth.client();
    const result = await client.auth.verifyOtp({ email: normalizeEmail(email), token: String(token || "").trim(), type: "email" });
    if (result.error) throw result.error;
    if (!result.data || !result.data.session || !result.data.user) throw new Error("The one-time code could not be verified.");
    return result.data.user;
  }

  function decodeClaims(accessToken) {
    try {
      const segment = String(accessToken || "").split(".")[1] || "";
      const normalized = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(segment.length / 4) * 4, "=");
      return JSON.parse(decodeURIComponent(Array.prototype.map.call(atob(normalized), function (character) {
        return "%" + character.charCodeAt(0).toString(16).padStart(2, "0");
      }).join("")));
    } catch (_) { return null; }
  }

  function allowedClaims(claims) {
    const methods = claims && Array.isArray(claims.amr) ? claims.amr : [];
    return methods.some(function (entry) { return entry && ALLOWED_METHODS.has(entry.method); });
  }

  async function sessionUsesCorporateMethod() {
    const client = await KridiyaAuth.client();
    if (typeof client.auth.getClaims === "function") {
      const claimsResult = await client.auth.getClaims();
      if (!claimsResult.error && allowedClaims(claimsResult.data && claimsResult.data.claims)) return true;
    }
    const result = await client.auth.getSession();
    if (result.error || !result.data || !result.data.session) return false;
    return allowedClaims(decodeClaims(result.data.session.access_token));
  }

  function showStatus(element, text, error) {
    if (!element) return;
    element.textContent = text || "";
    element.hidden = !text;
    element.className = "form-banner " + (error ? "error" : "success");
  }

  function readable(error, fallback) {
    const message = String(error && (error.message || error.code) || "");
    if (/expired|invalid.*otp|token.*invalid|otp.*invalid/i.test(message)) return "That code is invalid or has expired. Request a new code and try again.";
    if (/rate|too many/i.test(message)) return "Too many attempts. Wait a moment before requesting another code.";
    if (/fetch|network|connection/i.test(message)) return "Could not reach the account service. Check your connection and try again.";
    return fallback;
  }

  async function setupProviders() {
    const status = document.getElementById("corporate-google-status");
    const invalidInvitation = document.body.dataset.page === "corporate-invitation" && !/^[a-f0-9]{64}$/.test(new URLSearchParams(location.search).get("token") || "");
    const availability = invalidInvitation ? { google: false, azure: false } : await providerAvailability();
    let availableCount = 0;
    [["google", "corporate-google-sign-in"], ["azure", "corporate-microsoft-sign-in"]].forEach(function (pair) {
      const provider = pair[0];
      const button = document.getElementById(pair[1]);
      if (!button) return;
      const available = Boolean(availability[provider]);
      button.hidden = !available;
      button.disabled = !available;
      if (available) availableCount += 1;
      button.addEventListener("click", async function () {
        if (button.disabled) return;
        button.disabled = true;
        showStatus(status, "Opening " + PROVIDERS[provider] + "…", false);
        try { await startOAuth(provider, returnTarget()); }
        catch (error) {
          showStatus(status, readable(error, "Could not start " + PROVIDERS[provider] + " sign-in. Use a one-time email code instead."), true);
          button.disabled = false;
        }
      });
    });
    if (invalidInvitation) showStatus(status, "A valid company invitation is required.", true);
    else if (availableCount) showStatus(status, "", false);
    else showStatus(status, "Company identity providers are not configured yet. Use a one-time email code.", false);
  }

  async function setupLogin() {
    const emailForm = document.getElementById("corporate-email-form");
    const codeForm = document.getElementById("corporate-code-form");
    if (!emailForm || !codeForm) return;
    const email = emailForm.elements.namedItem("email");
    const code = codeForm.elements.namedItem("code");
    const guidance = document.getElementById("corporate-code-guidance");
    const target = returnTarget();
    let pending = false;
    let verifiedEmail = "";

    try {
      const current = await KridiyaAuth.currentUser();
      if (current && await sessionUsesCorporateMethod()) { location.replace(target); return; }
      if (current) await KridiyaAuth.logout();
    } catch (_) { /* Keep sign-in usable. */ }

    function busy(form, on) {
      pending = on;
      form.querySelectorAll("button,input").forEach(function (element) { element.disabled = on; });
    }
    function display(form, on) {
      form.hidden = !on;
      form.style.display = on ? "grid" : "none";
    }

    emailForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (pending || !emailForm.reportValidity()) return;
      const status = emailForm.querySelector(".form-banner");
      showStatus(status, "", false);
      busy(emailForm, true);
      try {
        verifiedEmail = await requestEmailCode(email.value, false);
        guidance.textContent = "Enter the six-digit code sent to " + verifiedEmail + ".";
        display(emailForm, false);
        display(codeForm, true);
        code.focus();
      } catch (error) {
        showStatus(status, readable(error, "Could not send a code. Confirm the approved work email or contact your company administrator."), true);
      } finally { busy(emailForm, false); }
    });

    codeForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (pending || !verifiedEmail || !codeForm.reportValidity()) return;
      const status = codeForm.querySelector(".form-banner");
      showStatus(status, "", false);
      busy(codeForm, true);
      try {
        await verifyEmailCode(verifiedEmail, code.value);
        location.replace(target);
      } catch (error) {
        showStatus(status, readable(error, "Could not verify this code. Request a new code and try again."), true);
        code.value = "";
        code.focus();
      } finally { busy(codeForm, false); }
    });

    document.getElementById("corporate-change-email").addEventListener("click", function () {
      verifiedEmail = "";
      codeForm.reset();
      showStatus(codeForm.querySelector(".form-banner"), "", false);
      display(codeForm, false);
      display(emailForm, true);
      email.focus();
    });
  }

  async function completeCallback() {
    const status = document.getElementById("auth-callback-status");
    try {
      const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
      const query = new URLSearchParams(location.search);
      if (hash.has("error") || query.has("error")) throw new Error("Invalid authentication link");
      const client = await KridiyaAuth.client();
      const result = await client.auth.getSession();
      if (result.error || !result.data || !result.data.session) throw new Error("No active session");
      if (!(await sessionUsesCorporateMethod())) {
        await KridiyaAuth.logout();
        throw new Error("Corporate access requires a one-time code or approved company identity provider.");
      }
      const saved = read(RETURN_KEY);
      const target = saved && Number.isFinite(saved.at) && Date.now() - saved.at < 1800000 ? safeTarget(saved.target) : "corporate-account.html";
      remove(RETURN_KEY);
      history.replaceState(null, "", "auth-callback.html");
      location.replace(target);
    } catch (error) {
      history.replaceState(null, "", "auth-callback.html");
      showStatus(status, readable(error, "We could not verify this sign-in. Return to the corporate sign-in page and try again."), true);
    }
  }

  window.KridiyaIdentity = {
    providerAvailability: providerAvailability,
    startOAuth: startOAuth,
    safeTarget: safeTarget,
    requestEmailCode: requestEmailCode,
    verifyEmailCode: verifyEmailCode,
    sessionUsesCorporateMethod: sessionUsesCorporateMethod
  };

  function initialize() {
    if (document.body.dataset.page === "auth-callback") completeCallback();
    else {
      setupProviders();
      if (document.body.dataset.page === "login") setupLogin();
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
})();
