"use strict";

(function () {
  const emailForm = document.getElementById("invitation-email-form");
  const codeForm = document.getElementById("invitation-code-form");
  const providers = document.getElementById("invitation-google");
  const status = document.getElementById("invitation-status");
  const signedIn = document.getElementById("invitation-signed-in");
  const token = new URLSearchParams(location.search).get("token") || "";
  const validToken = /^[a-f0-9]{64}$/.test(token);
  let verifiedEmail = "";
  let pending = false;
  let completed = false;

  function visible(element, on, display) {
    if (!element) return;
    element.hidden = !on;
    element.style.display = on ? (display || "grid") : "none";
  }

  function show(message, kind, focus) {
    status.hidden = !message;
    status.textContent = message || "";
    status.className = "form-banner " + (kind || "error");
    if (message && focus) status.focus();
  }

  function setBusy(on) {
    pending = on;
    [emailForm, codeForm, signedIn].forEach(function (container) {
      if (!container) return;
      container.setAttribute("aria-busy", String(on));
      container.querySelectorAll("button,input").forEach(function (element) { element.disabled = on; });
    });
  }

  function readable(error, fallback) {
    const message = String(error && (error.message || error.code) || "");
    if (/email|identity|intended|different.*user|mismatch/i.test(message)) return "Use the verified email named on this invitation. Switch identities below if needed.";
    if (/expired|revoked|not found|not valid|invalid.*invit|invit.*invalid/i.test(message)) return "This invitation is no longer available. Ask your company administrator for a new link.";
    if (/invalid.*otp|token.*invalid|otp.*invalid/i.test(message)) return "That code is invalid or has expired. Request a new code and try again.";
    if (/rate|too many/i.test(message)) return "Too many attempts. Wait before trying again.";
    if (/fetch|network|connection/i.test(message)) return "Could not reach the account service. Check your connection and try again.";
    return fallback;
  }

  function hideAuthForms() {
    visible(emailForm, false);
    visible(codeForm, false);
    visible(providers, false);
  }

  function showEmailForm(focus) {
    visible(signedIn, false);
    visible(codeForm, false);
    visible(emailForm, true);
    visible(providers, true);
    if (focus) emailForm.elements.namedItem("email").focus();
  }

  function showSignedIn(user, focus) {
    hideAuthForms();
    visible(signedIn, true);
    const identity = document.createElement("p");
    identity.textContent = "Verified as " + String(user.email || "your account") + ".";
    const acceptButton = document.createElement("button");
    acceptButton.type = "button";
    acceptButton.className = "btn btn-primary btn-block";
    acceptButton.textContent = "Accept invitation";
    acceptButton.addEventListener("click", acceptWithFeedback);
    const switchButton = document.createElement("button");
    switchButton.type = "button";
    switchButton.className = "btn btn-outline btn-block";
    switchButton.textContent = "Use another identity";
    switchButton.addEventListener("click", async function () {
      if (pending) return;
      setBusy(true);
      try {
        await KridiyaAuth.logout();
        emailForm.reset();
        codeForm.reset();
        verifiedEmail = "";
        show("");
        showEmailForm(true);
      } catch (_) {
        show("Could not sign out. Try again before switching identities.", "error", true);
      } finally {
        setBusy(false);
        emailForm.elements.namedItem("email").focus();
      }
    });
    signedIn.replaceChildren(identity, acceptButton, switchButton);
    setBusy(pending);
    if (focus) acceptButton.focus();
  }

  async function accept() {
    const client = await KridiyaAuth.client();
    const result = await client.rpc("accept_corporate_portal_invitation", { p_token: token });
    if (result.error) throw result.error;
    if (!result.data || result.data.ok !== true) {
      show(result.data && result.data.status === "expired" ? "This invitation has expired. Ask your company administrator for a new link." : "This invitation cannot be accepted. Ask your company administrator to check your access.", "error", true);
      return;
    }
    completed = true;
    hideAuthForms();
    visible(signedIn, true);
    const openPortal = document.createElement("a");
    openPortal.className = "btn btn-primary btn-block";
    openPortal.href = "corporate-account.html";
    openPortal.textContent = "Open company portal";
    signedIn.replaceChildren(openPortal);
    const cleanUrl = new URL(location.href);
    cleanUrl.searchParams.delete("token");
    history.replaceState(null, "", cleanUrl.href);
    show("Invitation accepted. Your individual company access is now active.", "success", true);
  }

  async function acceptWithFeedback() {
    if (pending || completed || !validToken) return;
    setBusy(true);
    show("");
    try { await accept(); }
    catch (error) { show(readable(error, "Could not accept this invitation. Ask your company administrator to check the link and access."), "error", true); }
    finally { setBusy(false); }
  }

  emailForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (pending || completed || !validToken || !emailForm.reportValidity()) return;
    setBusy(true);
    show("");
    try {
      verifiedEmail = await KridiyaIdentity.requestEmailCode(emailForm.elements.namedItem("email").value, true);
      document.getElementById("invitation-code-guidance").textContent = "Enter the six-digit code sent to " + verifiedEmail + ".";
      visible(emailForm, false);
      visible(providers, false);
      visible(codeForm, true);
      codeForm.elements.namedItem("code").focus();
    } catch (error) {
      show(readable(error, "Could not send a one-time code. Confirm the invited email and try again."), "error", true);
    } finally { setBusy(false); }
  });

  codeForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (pending || completed || !verifiedEmail || !codeForm.reportValidity()) return;
    setBusy(true);
    show("");
    try {
      const user = await KridiyaIdentity.verifyEmailCode(verifiedEmail, codeForm.elements.namedItem("code").value);
      showSignedIn(user);
      await accept();
    } catch (error) {
      codeForm.elements.namedItem("code").value = "";
      show(readable(error, "Could not verify this code or accept the invitation. Try again or ask your company administrator for help."), "error", true);
    } finally { setBusy(false); }
  });

  document.getElementById("invitation-change-email").addEventListener("click", function () {
    verifiedEmail = "";
    codeForm.reset();
    show("");
    showEmailForm(true);
  });

  async function initialize() {
    hideAuthForms();
    if (!validToken) {
      show("This invitation link is incomplete or invalid. Ask your company administrator for a new link.", "error", true);
      return;
    }
    try {
      const user = await KridiyaAuth.currentUser();
      if (user && await KridiyaIdentity.sessionUsesCorporateMethod()) showSignedIn(user);
      else {
        if (user) await KridiyaAuth.logout();
        showEmailForm(false);
      }
    } catch (error) {
      showEmailForm(false);
      show(readable(error, "Could not check your identity. Verify your invited email to continue."), "error", true);
    }
  }

  initialize();
})();
