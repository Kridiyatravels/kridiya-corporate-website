"use strict";

// Workspace presentation and context. Company authorization remains server-side.
window.KridiyaWorkspace = (function () {
  let activeCompany = null;
  let signedInUser = null;
  let revoked = false;
  let profile = null;
  let profileRequest = 0;
  let formDirty = false;
  let pendingDialog = null;
  const editableFields = ["phone", "address", "billing_email", "accounts_email"];
  const descriptions = {
    overview: "The next actions and latest updates for your company.",
    request: "Send a travel requirement for your active company.",
    travellers: "Maintain the traveller details your company uses for travel.",
    quotes: "Review released options, approvals and requested revisions.",
    bookings: "Follow each booking from request through supplier confirmation.",
    documents: "Find the travel documents released to your company.",
    finance: "Review payment requests and submit supporting evidence.",
    statement: "Monthly booking, receipt and refund activity—not a reconciled account statement.",
    desk: "Track changes, document requests and support cases.",
    company: "Company details, contacts, branches and travel policy.",
    settings: "Your account, company permissions and display preferences."
  };

  function byId(id) { return document.getElementById(id); }
  function allowed(section) {
    if (!activeCompany || revoked) return false;
    if (section === "request") return activeCompany.can_request === true;
    if (section === "finance") return activeCompany.can_view_finance === true;
    if (section === "documents") return activeCompany.can_view_documents === true;
    return Object.prototype.hasOwnProperty.call(descriptions, section);
  }

  function clearContext(message) {
    if (revoked) return;
    revoked = true;
    profileRequest++;
    profile = null;
    activeCompany = null;
    // Reset report generations before removing DOM, including company switches
    // and auth events. A module failure must never prevent private-state clearing.
    if (window.KridiyaCorporateReport && typeof window.KridiyaCorporateReport.reset === "function") {
      try { window.KridiyaCorporateReport.reset(); } catch (_) { /* Continue clearing the workspace. */ }
    }
    const app = byId("corporate-account-app");
    if (app) { app.hidden = true; app.replaceChildren(); }
    const gate = byId("corporate-account-gate");
    if (gate) { gate.hidden = false; gate.textContent = message || "Checking your access again…"; }
    const switcher = byId("corp-company-switch");
    if (switcher) { switcher.disabled = true; switcher.replaceChildren(); }
    ["corp-sidebar-company", "corp-sidebar-role", "corp-session-label"].forEach(function (id) {
      if (byId(id)) byId(id).textContent = "";
    });
    const dialog = byId("corp-action-dialog");
    if (pendingDialog) pendingDialog.cancel(true);
    else if (dialog && dialog.open) dialog.close("cancel");
    document.querySelectorAll(".site-toast").forEach(function (el) { el.remove(); });
  }

  function lifecycle(user) {
    signedInUser = user;
    window.addEventListener("pagehide", function () { clearContext(); });
    window.addEventListener("pageshow", function (event) { if (event.persisted) location.reload(); });
    window.KridiyaAuth.client().then(function (client) {
      client.auth.onAuthStateChange(function (event, session) {
        const nextUserId = session && session.user && session.user.id;
        if (event === "SIGNED_OUT" || (nextUserId && nextUserId !== user.id)) {
          clearContext("Your session changed. Opening sign in…");
          location.replace("login.html?next=corporate-account.html");
        }
      });
    }).catch(function () {
      clearContext("Your session could not be verified. Reload to sign in again.");
    });
  }

  function actionDialog(options) {
    const dialog = byId("corp-action-dialog");
    if (!dialog || revoked || (dialog.open && !dialog.classList.contains("is-closing"))) return Promise.resolve(null);
    // A new action can replace a closing dialog without an old timeout closing
    // the new one. Complete the previous result before installing new handlers.
    if (pendingDialog) pendingDialog.finish();
    const input = byId("corp-dialog-input");
    byId("corp-dialog-title").textContent = options.title;
    byId("corp-dialog-copy").textContent = options.description;
    byId("corp-dialog-confirm").textContent = options.confirm || "Confirm";
    byId("corp-dialog-input-wrap").hidden = !options.input;
    input.required = !!options.input;
    input.value = "";
    dialog.returnValue = "cancel";
    return new Promise(function (resolve) {
      let result = null;
      let settled = false;
      const form = byId("corp-dialog-form");
      const cancelButton = byId("corp-dialog-cancel");
      const request = { finish: finish, cancel: function (instant) { result = null; closeDialog("cancel", instant); } };
      pendingDialog = request;
      function finish() {
        if (settled) return;
        settled = true;
        dialog.removeEventListener("close", onNativeClose);
        dialog.removeEventListener("cancel", onCancel);
        form.onsubmit = null;
        cancelButton.onclick = null;
        input.oninput = null;
        input.value = "";
        if (pendingDialog === request) pendingDialog = null;
        resolve(revoked ? null : result);
      }
      function closeDialog(value, instant) {
        if (settled) return;
        const onHidden = function () {
          if (settled) return;
          if (dialog.open) dialog.close(value);
          finish();
        };
        if (window.KridiyaMotion) window.KridiyaMotion.hide(dialog, { instant: !!instant, onHidden: onHidden });
        else onHidden();
      }
      function onNativeClose() {
        // A queued close event from the prior action must not settle a reopened dialog.
        if (dialog.open) return;
        if (dialog.returnValue !== "confirm") result = null;
        finish();
      }
      function onCancel(event) { event.preventDefault(); request.cancel(true); }
      form.onsubmit = function (event) {
        event.preventDefault();
        if (options.input && input.value.trim().length < 10) {
          input.setCustomValidity("Please describe the requested changes in at least 10 characters.");
          input.reportValidity();
          return;
        }
        result = options.input ? input.value.trim() : true;
        closeDialog("confirm", document.documentElement.dataset.input === "keyboard");
      };
      input.oninput = function () { input.setCustomValidity(""); };
      input.setCustomValidity("");
      cancelButton.onclick = function (event) { request.cancel(event.detail === 0); };
      dialog.addEventListener("close", onNativeClose);
      dialog.addEventListener("cancel", onCancel);
      dialog.hidden = false;
      if (!dialog.open) dialog.showModal();
      if (window.KridiyaMotion) window.KridiyaMotion.show(dialog, { instant: !!options.instant });
      if (options.input) input.focus(); else byId("corp-dialog-cancel").focus();
    });
  }

  function configure(companies, company, user) {
    if (revoked) throw new Error("Your account context changed. Reload to continue.");
    activeCompany = company;
    signedInUser = user;
    const switcher = byId("corp-company-switch");
    switcher.replaceChildren();
    companies.forEach(function (item) {
      const option = document.createElement("option");
      option.value = item.corporate_account_id;
      option.textContent = item.company_name || "Company";
      switcher.appendChild(option);
    });
    switcher.value = company.corporate_account_id;
    switcher.disabled = companies.length < 2;
    byId("corp-session-label").textContent = user.email || "Signed in";
    byId("corp-settings-identity").textContent = "Signed in as " + (user.email || user.name || "company member");
    switcher.addEventListener("change", async function () {
      const targetId = switcher.value;
      if (!companies.some(function (item) { return item.corporate_account_id === targetId; })) return;
      if (formDirty && !await actionDialog({ title: "Switch company?", description: "Unsaved form details in this workspace will be discarded.", confirm: "Switch company" })) {
        switcher.value = company.corporate_account_id;
        return;
      }
      const url = new URL(location.href);
      url.searchParams.set("company", targetId);
      url.hash = "overview";
      clearContext("Opening the selected company…");
      location.assign(url.href);
    });
    byId("corporate-account-app").addEventListener("input", function (event) {
      if (event.target.closest("form") && !event.target.closest("#corp-dialog-form")) formDirty = true;
    });
    document.querySelectorAll("[data-portal-tab-open], [data-portal-tab]").forEach(function (control) {
      const section = control.dataset.portalTabOpen || control.dataset.portalTab;
      control.hidden = !allowed(section);
    });
    const permissions = [
      ["Travel requests", company.can_request], ["Quote approvals", company.can_approve_quotes],
      ["Travel documents", company.can_view_documents], ["Company finance", company.can_view_finance]
    ];
    byId("corp-access-permissions").replaceChildren();
    permissions.forEach(function (item) { fact(byId("corp-access-permissions"), item[0], item[1] === true ? "Enabled" : "Not enabled"); });
    byId("corp-security-reset").addEventListener("click", async function (event) {
      const button = event.currentTarget;
      button.disabled = true;
      byId("corp-security-status").textContent = "Requesting reset link…";
      try {
        await window.KridiyaAuth.resetPassword(user.email);
        if (!revoked) byId("corp-security-status").textContent = "If an account matches, a password reset link will arrive at your account email.";
      } catch (_) {
        if (!revoked) byId("corp-security-status").textContent = "The reset link could not be requested. Please try again.";
      } finally { button.disabled = false; }
    });
    const density = byId("corp-compact-density");
    try { density.checked = localStorage.getItem("kridiya_portal_density") === "compact"; } catch (_) { /* Optional display preference. */ }
    document.body.dataset.portalDensity = density.checked ? "compact" : "comfortable";
    density.addEventListener("change", function () {
      document.body.dataset.portalDensity = density.checked ? "compact" : "comfortable";
      try { localStorage.setItem("kridiya_portal_density", document.body.dataset.portalDensity); } catch (_) { /* Private browsing may deny storage. */ }
    });
    byId("corp-booking-search").addEventListener("input", filterBookings);
    byId("corp-profile-retry").addEventListener("click", loadProfile);
    byId("corp-profile-form").addEventListener("submit", saveProfile);
    byId("corp-contacts-more").addEventListener("click", loadMoreContacts);
    if (company.can_request !== true) {
      document.querySelectorAll("#corp-traveller-form input, #corp-traveller-form button, #corp-traveller-csv, #corp-traveller-import").forEach(function (control) { control.disabled = true; });
    }
    loadProfile();
  }

  function fact(container, label, value) {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value === null || value === undefined || value === "" ? "Not provided" : String(value);
    row.append(term, detail);
    container.appendChild(row);
  }

  async function loadProfile() {
    if (revoked || !activeCompany) return;
    const request = ++profileRequest;
    byId("corp-profile-status").hidden = false;
    byId("corp-profile-status").textContent = "Loading company profile…";
    byId("corp-profile-retry").hidden = true;
    byId("corp-profile-content").hidden = true;
    profile = null;
    try {
      const client = await window.KridiyaAuth.client();
      const result = await client.rpc("get_my_corporate_company_profile", { p_corporate_account_id: activeCompany.corporate_account_id });
      if (revoked || request !== profileRequest) return;
      if (result.error || !result.data || !result.data.account || result.data.account.id !== activeCompany.corporate_account_id) throw new Error("Profile unavailable");
      renderProfile(result.data);
    } catch (_) {
      if (revoked || request !== profileRequest) return;
      byId("corp-profile-status").textContent = "Company profile is unavailable. Your other workspace sections remain accessible. Please retry or contact the corporate desk.";
      byId("corp-profile-retry").hidden = false;
    }
  }

  function renderProfile(data) {
    profile = data;
    const account = data.account;
    const capabilities = data.capabilities || {};
    const canEdit = capabilities.can_edit_company_profile === true;
    byId("corp-profile-status").hidden = true;
    byId("corp-profile-content").hidden = false;
    const facts = byId("corp-profile-facts");
    facts.replaceChildren();
    [["Company name", account.company_name], ["Account status", window.KridiyaAuth.statusLabel(account.status)],
      ["Trade licence", account.trade_license_no], ["Tax registration", account.trn],
      ["Your role", window.KridiyaAuth.statusLabel(data.membership && data.membership.role || activeCompany.member_role)],
      ["LPO required", account.lpo_required ? "Yes" : "No"]].forEach(function (row) { fact(facts, row[0], row[1]); });
    if (capabilities.can_view_finance === true) {
      fact(facts, "Configured payment terms", account.payment_terms);
      fact(facts, "Monthly reporting flag", account.monthly_billing ? "Configured" : "Not configured");
      fact(facts, "Recorded credit flag", account.credit_allowed ? "Configured — not active for fulfilment" : "Not configured");
      fact(facts, "Current release", "Prepaid. Verified funds are required; LPO and configured terms do not authorize credit fulfilment.");
    }
    editableFields.forEach(function (key) { byId("corp-profile-form").elements[key].value = account[key] || ""; });
    byId("corp-profile-fields").disabled = !canEdit;
    byId("corp-profile-save").hidden = !canEdit;
    byId("corp-profile-edit-note").textContent = canEdit ? "As a company owner, you can update these contact details." : "These details are managed by your company owner. Contact the corporate desk to request a change.";
    document.querySelectorAll("[data-profile-finance]").forEach(function (el) { el.hidden = !canEdit && capabilities.can_view_finance !== true; });
    const contacts = byId("corp-profile-contacts");
    contacts.replaceChildren();
    const availability = data.availability && data.availability.contacts;
    const visible = capabilities.can_view_contacts === true && (!availability || availability.available !== false);
    const rows = visible && Array.isArray(data.contacts) ? data.contacts : [];
    byId("corp-profile-contacts-note").textContent = !visible ? "The company contact directory is restricted to authorized company owners." : rows.length ? "Authorized company and accounts contacts." : "No company contacts are available.";
    appendContacts(rows);
    byId("corp-contacts-more").hidden = !visible || !availability || !availability.truncated || !availability.next_cursor;
    byId("corp-contacts-more").disabled = false;
    if (availability && availability.truncated) byId("corp-profile-contacts-note").textContent += " Showing " + rows.length + " of " + availability.total_count + " contacts.";
  }

  function appendContacts(rows) {
    const contacts = byId("corp-profile-contacts");
    rows.forEach(function (contact) {
      const article = document.createElement("article");
      article.className = "portal-contact-record";
      const title = document.createElement("h4");
      const copy = document.createElement("p");
      title.textContent = contact.full_name || "Company contact";
      copy.textContent = [contact.job_title, contact.email, contact.phone, contact.is_authorized_contact ? "Authorized contact" : "", contact.is_accounts_contact ? "Accounts contact" : ""].filter(Boolean).join(" · ");
      article.append(title, copy); contacts.appendChild(article);
    });
  }

  async function loadMoreContacts() {
    if (revoked || !profile || !profile.capabilities || profile.capabilities.can_view_contacts !== true) return;
    const availability = profile.availability && profile.availability.contacts;
    if (!availability || !availability.next_cursor) return;
    const button = byId("corp-contacts-more");
    const request = profileRequest;
    const cursor = availability.next_cursor;
    button.disabled = true;
    button.textContent = "Loading contacts…";
    try {
      const client = await window.KridiyaAuth.client();
      const result = await client.rpc("list_my_corporate_company_directory", {
        p_corporate_account_id: activeCompany.corporate_account_id, p_section: "contacts", p_limit: 100,
        p_after_created_at: cursor.created_at, p_after_id: cursor.id
      });
      if (revoked || request !== profileRequest) return;
      if (result.error || !result.data || result.data.available !== true || !Array.isArray(result.data.rows)) throw new Error("Directory unavailable");
      const seen = new Set(profile.contacts.map(function (contact) { return contact.id; }));
      const next = result.data.rows.filter(function (contact) { return !seen.has(contact.id); });
      profile.contacts.push.apply(profile.contacts, next);
      profile.availability.contacts = result.data;
      appendContacts(next);
      byId("corp-profile-contacts-note").textContent = "Showing " + profile.contacts.length + " of " + result.data.total_count + " authorized company contacts.";
      button.hidden = !result.data.truncated || !result.data.next_cursor;
    } catch (_) {
      if (!revoked) byId("corp-profile-contacts-note").textContent = "More contacts could not be loaded. Your current directory remains visible; try again.";
    } finally { button.disabled = false; button.textContent = "Load more contacts"; }
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (revoked || !profile || !profile.capabilities || profile.capabilities.can_edit_company_profile !== true) return;
    const button = byId("corp-profile-save");
    const status = byId("corp-profile-save-status");
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const changes = {};
    editableFields.forEach(function (key) {
      const next = form.elements[key].value.trim() || null;
      if (next !== (profile.account[key] || null)) changes[key] = next;
    });
    if (!Object.keys(changes).length) { status.textContent = "No changes to save."; return; }
    const request = profileRequest;
    button.disabled = true;
    status.textContent = "Saving company details…";
    try {
      const client = await window.KridiyaAuth.client();
      const result = await client.rpc("update_my_corporate_company_profile", {
        p_corporate_account_id: activeCompany.corporate_account_id,
        p_expected_updated_at: profile.account.updated_at, p_changes: changes
      });
      if (revoked || request !== profileRequest) return;
      if (result.error || !result.data || !result.data.account || result.data.account.id !== activeCompany.corporate_account_id) throw new Error("Save failed");
      renderProfile(result.data);
      status.textContent = "Company details saved.";
      formDirty = false;
    } catch (_) {
      if (!revoked) {
        status.textContent = "Could not save. Access or company details may have changed. Your entries are retained; reload the profile before retrying.";
        byId("corp-profile-retry").hidden = false;
      }
    } finally { button.disabled = false; }
  }

  function filterBookings() {
    if (revoked) return;
    const search = byId("corp-booking-search");
    if (!search) return;
    const query = search.value.trim().toLowerCase();
    const rows = Array.from(document.querySelectorAll("#corp-booking-list .corporate-booking-card"));
    let visible = 0;
    rows.forEach(function (row) { row.hidden = !!query && !row.textContent.toLowerCase().includes(query); if (!row.hidden) visible++; });
    byId("corp-booking-results").textContent = query ? visible + " of " + rows.length + " bookings match your search." : "";
  }

  return { lifecycle: lifecycle, configure: configure, allowed: allowed, describe: function (name) { return descriptions[name] || ""; },
    dialog: actionDialog, clear: clearContext, revoked: function () { return revoked; }, recordsUpdated: filterBookings };
})();
