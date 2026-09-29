"use strict";

(function () {
  const loginForm = document.getElementById("invitation-auth-form");
  const registerForm = document.getElementById("invitation-register-form");
  const mode = document.getElementById("invitation-mode");
  const showLogin = document.getElementById("show-invitation-login");
  const showRegister = document.getElementById("show-invitation-register");
  const status = document.getElementById("invitation-status");
  const signedIn = document.getElementById("invitation-signed-in");
  const token = new URLSearchParams(location.search).get("token") || "";
  const validToken = /^[a-f0-9]{64}$/.test(token);
  let pending = false;
  let registrationSent = false;
  let completed = false;

  function visible(element, on, display) {
    element.hidden = !on;
    element.style.display = on ? (display || "grid") : "none";
  }

  function field(form, name) {
    return form.elements.namedItem(name);
  }

  function show(message, kind, focus) {
    status.hidden = !message;
    status.textContent = message || "";
    status.className = "form-banner " + (kind || "error");
    if (message && focus) status.focus();
  }

  function setBusy(on) {
    pending = on;
    [loginForm, registerForm, signedIn].forEach(function (container) {
      container.setAttribute("aria-busy", String(on));
      container.querySelectorAll("button").forEach(function (button) {
        button.disabled = on || (registrationSent && container === registerForm);
      });
    });
    showLogin.disabled = on;
    showRegister.disabled = on;
  }

  function readable(error, fallback) {
    const message = String(error && (error.message || error.code) || "");
    if (/email|identity|intended|different.*user|mismatch/i.test(message)) return "Use the verified email named on this invitation. You can sign out below to switch accounts.";
    if (/expired|revoked|not found|not valid|invalid.*invit|invit.*invalid/i.test(message)) return "This invitation is no longer available. Ask your company reviewer for a new link.";
    if (/invalid login|credentials|password/i.test(message)) return "Could not sign in. Check your email and password, or reset your password.";
    if (/rate|too many/i.test(message)) return "Too many attempts. Please wait before trying again.";
    if (/fetch|network|connection/i.test(message)) return "Could not reach the account service. Check your connection and try again.";
    return fallback;
  }

  function callbackUrl() {
    const callback = new URL("corporate-invitation.html", location.href);
    callback.searchParams.set("token", token);
    return callback.href;
  }

  function setMode(next, focus) {
    if (pending || completed || !validToken) return;
    const registering = next === "register";
    visible(loginForm, !registering);
    visible(registerForm, registering);
    visible(mode, true, "flex");
    visible(signedIn, false);
    showLogin.setAttribute("aria-pressed", String(!registering));
    showRegister.setAttribute("aria-pressed", String(registering));
    show("");
    if (focus) field(registering ? registerForm : loginForm, registering ? "name" : "email").focus();
  }

  function hideAccountForms() {
    visible(loginForm, false);
    visible(registerForm, false);
    visible(mode, false);
  }

  function showSignedIn(user, focus) {
    hideAccountForms();
    visible(signedIn, true);
    signedIn.replaceChildren();
    const identity = document.createElement("p");
    identity.textContent = "Signed in as " + String(user.email || "your account") + ".";
    const acceptButton = document.createElement("button");
    acceptButton.type = "button";
    acceptButton.className = "btn btn-primary btn-block";
    acceptButton.textContent = "Accept invitation";
    acceptButton.addEventListener("click", acceptWithFeedback);
    const switchButton = document.createElement("button");
    switchButton.type = "button";
    switchButton.className = "btn btn-outline btn-block";
    switchButton.textContent = "Sign out and use another account";
    switchButton.addEventListener("click", async function () {
      if (pending) return;
      setBusy(true);
      try {
        await KridiyaAuth.logout();
        signedIn.replaceChildren();
        loginForm.reset();
        registerForm.reset();
        setBusy(false);
        setMode("login", true);
      } catch (error) {
        show("Could not sign out. Please try again before switching accounts.", "error", true);
      } finally {
        setBusy(false);
      }
    });
    signedIn.append(identity, acceptButton, switchButton);
    setBusy(pending);
    if (focus) acceptButton.focus();
  }

  async function accept() {
    const client = await KridiyaAuth.client();
    const result = await client.rpc("accept_corporate_portal_invitation", { p_token: token });
    if (result.error) throw result.error;
    if (!result.data || result.data.ok !== true) {
      show(result.data && result.data.status === "expired" ? "This invitation has expired. Ask your company reviewer for a new link." : "This invitation cannot be accepted. Ask your company reviewer to check your access.", "error", true);
      return;
    }
    completed = true;
    loginForm.reset();
    registerForm.reset();
    hideAccountForms();
    visible(signedIn, true);
    const openPortal = document.createElement("a");
    openPortal.className = "btn btn-primary btn-block";
    openPortal.href = "corporate-account.html";
    openPortal.textContent = "Open company portal";
    signedIn.replaceChildren(openPortal);
    // Remove the consumed secret from the URL and browser history entry.
    const cleanUrl = new URL(location.href);
    cleanUrl.searchParams.delete("token");
    history.replaceState(null, "", cleanUrl.href);
    show("Invitation accepted. Open the portal to view your current company access.", "success", true);
  }

  async function acceptWithFeedback() {
    if (pending || completed || !validToken) return;
    setBusy(true);
    show("");
    try {
      await accept();
    } catch (error) {
      show(readable(error, "Could not accept your invitation. Ask your company reviewer to check the link and your access."), "error", true);
    } finally {
      setBusy(false);
    }
  }

  async function initialize() {
    hideAccountForms();
    if (!validToken) {
      show("This invitation link is incomplete or invalid. Ask your company reviewer for a new link.");
      return;
    }
    try {
      const user = await KridiyaAuth.currentUser();
      if (user) showSignedIn(user);
      else setMode("login");
    } catch (error) {
      setMode("login");
      show(readable(error, "Could not check your account. Sign in to continue."));
    }
  }

  showLogin.addEventListener("click", function () { setMode("login", true); });
  showRegister.addEventListener("click", function () { setMode("register", true); });

  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (pending || completed || !validToken || !loginForm.reportValidity()) return;
    show("");
    setBusy(true);
    try {
      const user = await KridiyaAuth.login(field(loginForm, "email").value, field(loginForm, "password").value);
      field(loginForm, "password").value = "";
      showSignedIn(user);
      await accept();
    } catch (error) {
      show(readable(error, "Could not sign in or accept this invitation. Please try again or ask your reviewer to check your access."), "error", true);
    } finally {
      setBusy(false);
    }
  });

  registerForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (pending || completed || registrationSent || !validToken) return;
    const password = field(registerForm, "password");
    const name = field(registerForm, "name");
    password.setCustomValidity(KridiyaAuth.passwordIssue(password.value));
    name.setCustomValidity(name.value.trim().length < 2 ? "Enter your full name." : "");
    if (!registerForm.reportValidity()) return;
    show("");
    setBusy(true);
    try {
      const client = await KridiyaAuth.client();
      const result = await client.auth.signUp({
        email: field(registerForm, "email").value.trim().toLowerCase(),
        password: password.value,
        options: { emailRedirectTo: callbackUrl(), data: { full_name: name.value.trim() } }
      });
      if (result.error) throw result.error;
      password.value = "";
      if (result.data && result.data.session) {
        await KridiyaAuth.logout();
        show("Email verification is required before this invitation can activate. Ask your reviewer for help.", "error", true);
        return;
      }
      registrationSent = true;
      registerForm.querySelectorAll("input").forEach(function (input) { input.readOnly = true; });
      show("Check your email for a verification link. After verification, open your original invitation if you are not returned here.", "success", true);
    } catch (error) {
      show(readable(error, "Could not create this account. If you already have a login, choose Existing account or reset your password."), "error", true);
    } finally {
      setBusy(false);
    }
  });

  registerForm.addEventListener("input", function (event) {
    if (typeof event.target.setCustomValidity === "function") event.target.setCustomValidity("");
  });

  initialize();
})();
