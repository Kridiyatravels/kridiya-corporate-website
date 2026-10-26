"use strict";

(function () {
  const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  const RETURN_KEY = "kridiya_corporate_checkout_return";
  const statuses = new Set(["creating", "open", "processing", "succeeded", "reconciliation_required", "expired", "failed"]);
  const requestIds = new Map();
  const announced = new Map();
  let generation = 0;
  let pollTimer = null;

  function requireId(value) {
    if (!UUID.test(String(value || ""))) throw new Error("A valid payment reference is required.");
    return String(value);
  }
  function checkoutURL(value) {
    const url = new URL(String(value));
    if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" || url.username || url.password || url.port) {
      throw new Error("The secure payment address could not be verified.");
    }
    return url.href;
  }
  function statusCopy(attempt) {
    if (attempt && attempt.livemode === false && ["succeeded", "reconciliation_required"].includes(attempt.status)) return "Test receipt — no business funds allocated. This does not confirm payment or travel.";
    if (attempt && attempt.financial_hold === true) return "This payment is under finance review. Please do not pay again. The corporate desk will confirm the next step.";
    const messages = {
      creating: "Secure checkout is being prepared. No payment has been confirmed.",
      open: "Checkout is open. No successful payment has been confirmed yet.",
      processing: "Your payment is processing. Please wait for confirmation before paying again.",
      succeeded: "Payment verified and allocated. Kridiya will continue supplier arrangements; travel is not confirmed by payment alone.",
      reconciliation_required: "Payment received. Finance is checking its allocation to this request. Please do not pay again.",
      expired: "This checkout has expired. Check the current payment request before starting again.",
      failed: "This payment attempt was unsuccessful. Check the current request before trying again."
    };
    return messages[attempt && attempt.status] || "Payment status is unavailable. Check with the corporate desk before paying again.";
  }
  async function edge(method, body) {
    const configuration = KridiyaAuth.publicConfiguration();
    const headers = {};
    if (method === "POST") {
      const client = await KridiyaAuth.client();
      const session = await client.auth.getSession();
      if (session.error || !session.data || !session.data.session || !session.data.session.access_token) throw new Error("Please sign in again before paying.");
      headers.apikey = configuration.publishableKey;
      headers.Authorization = "Bearer " + session.data.session.access_token;
      headers["Content-Type"] = "application/json";
    }
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, 20000);
    try {
      const response = await fetch(configuration.url + "/functions/v1/corporate-stripe-checkout", {
        method: method, headers: headers, body: body ? JSON.stringify(body) : undefined,
        cache: "no-store", signal: controller.signal
      });
      const result = await response.json();
      if (!response.ok) {
        const error = new Error(method === "POST" ? "Could not confirm the checkout request. Check payment status or retry this request." : "Card payment availability could not be checked.");
        error.code = result && result.code || "unavailable";
        throw error;
      }
      return result;
    } finally { clearTimeout(timer); }
  }
  async function availability() {
    try {
      const result = await edge("GET");
      return {
        available: result.available === true,
        livemode: typeof result.livemode === "boolean" ? result.livemode : null,
        currencies: Array.isArray(result.currencies) ? result.currencies.map(function (value) { return String(value).toUpperCase(); }) : []
      };
    } catch (_) { return { available: false, livemode: null, currencies: [], unavailable: true }; }
  }
  async function start(paymentRequestId, options) {
    const id = requireId(paymentRequestId);
    const client = await KridiyaAuth.client();
    const session = await client.auth.getSession();
    const user = session.data && session.data.session && session.data.session.user;
    if (session.error || !user || !user.id) throw new Error("Please sign in again before paying.");
    const key = "kridiya_checkout_request:" + user.id + ":" + id;
    let requestId = requestIds.get(key);
    try { requestId = requestId || sessionStorage.getItem(key); } catch (_) {}
    if (!UUID.test(requestId || "") || options && options.newAttempt === true) requestId = crypto.randomUUID();
    requestIds.set(key, requestId);
    try { sessionStorage.setItem(key, requestId); } catch (_) {}
    // Keep this ID after an unknown result so retries cannot create another charge.
    const result = await edge("POST", { payment_request_id: id, request_id: requestId });
    requireId(result.attempt_id);
    if (!statuses.has(result.status)) throw new Error("Payment status is not available yet.");
    if (result.checkout_url) result.checkout_url = checkoutURL(result.checkout_url);
    return result;
  }
  async function get(attemptId) {
    const client = await KridiyaAuth.client();
    const result = await client.rpc("get_my_corporate_stripe_payment_attempt", { p_attempt_id: requireId(attemptId) });
    if (result.error || !result.data || !statuses.has(result.data.status)) throw new Error("The payment status could not be checked. Please retry or contact the corporate desk.");
    return result.data;
  }
  async function list(companyId, paymentRequestId) {
    const client = await KridiyaAuth.client();
    const result = await client.rpc("list_my_corporate_stripe_payment_attempts", {
      p_corporate_account_id: requireId(companyId),
      p_payment_request_id: paymentRequestId ? requireId(paymentRequestId) : null
    });
    if (result.error || !Array.isArray(result.data)) throw new Error("Payment history is unavailable.");
    return result.data;
  }
  function rememberReturn() {
    const parameters = new URLSearchParams(location.search);
    const id = parameters.get("payment_attempt");
    if (UUID.test(id || "") && ["success", "cancel"].includes(parameters.get("checkout_return"))) {
      try { sessionStorage.setItem(RETURN_KEY, JSON.stringify({ id: id, at: Date.now() })); } catch (_) {}
      return id;
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem(RETURN_KEY) || "null");
      if (saved && UUID.test(saved.id) && Number.isFinite(saved.at) && Date.now() - saved.at < 3600000) return saved.id;
    } catch (_) {}
    return null;
  }
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }
  function clear() {
    generation++;
    clearTimeout(pollTimer);
    pollTimer = null;
    const target = document.getElementById("corp-stripe-payments");
    if (target) target.replaceChildren();
  }
  async function mount(options) {
    clear();
    const current = generation;
    const target = options.target || document.getElementById("corp-stripe-payments");
    if (!target || options.canFinance !== true) return;
    const requests = Array.isArray(options.requests) ? options.requests : [];
    function active() { return current === generation && !(window.KridiyaWorkspace && window.KridiyaWorkspace.revoked()); }
    target.append(node("h3", "", "Card payments"));
    const summary = node("p", "", "Checking secure payment availability…");
    target.append(summary);
    const config = await availability();
    if (!active()) return;
    summary.textContent = config.available
      ? "Pay an outstanding approved quote securely with Stripe. The amount is checked before checkout."
      : "Card payments are currently unavailable. Use the bank transfer instructions on your payment request, or contact the corporate desk.";
    if (config.available && config.livemode === false) target.append(node("p", "form-banner", "Test checkout only. No live payment will be collected."));
    let attempts = [];
    let historyAvailable = true;
    try { attempts = await list(options.companyId); }
    catch (_) { historyAvailable = false; }
    if (!active()) return;
    const returnId = rememberReturn();
    let returnUnresolved = !!returnId;
    let returnedAttempt = null;
    const paymentButtons = new Map();
    const returnPanel = node("div", "form-grid");
    if (returnId) {
      const message = node("p", "form-banner", "You returned from checkout. Checking the payment result…");
      message.setAttribute("role", "status");
      const refresh = node("button", "btn btn-outline btn-sm", "Check payment status");
      refresh.type = "button";
      let checking = false;
      let pollCount = 0;
      async function check() {
        if (checking || !active()) return;
        checking = true;
        refresh.disabled = true;
        try {
          const attempt = await get(returnId);
          if (!active()) return;
          if (!requests.some(function (request) { return request.id === attempt.payment_request_id; }) || (attempt.corporate_account_id && attempt.corporate_account_id !== options.companyId)) {
            message.textContent = "This payment belongs to a different company context or an unavailable request. Open its approved company, or contact the corporate desk.";
            return;
          }
          returnUnresolved = false;
          returnedAttempt = attempt;
          paymentButtons.forEach(function (entry, id) {
            if (attempt.financial_hold === true && (id === attempt.payment_request_id || entry.bookingId && entry.bookingId === attempt.booking_id)) entry.financialHold = true;
            if (id === attempt.payment_request_id) {
              entry.blocked = ["creating", "processing", "succeeded", "reconciliation_required"].includes(attempt.status);
              entry.message.textContent = statusCopy(attempt);
              entry.button.textContent = attempt.status === "open" ? "Continue secure payment" : "Pay securely";
            }
            if (entry.financialHold) entry.message.textContent = statusCopy({ financial_hold: true });
            entry.button.disabled = entry.financialHold || entry.blocked || !entry.currencyAvailable;
          });
          message.textContent = statusCopy(attempt);
          const announcement = attempt.attempt_id + ":" + attempt.status + ":" + (attempt.financial_hold === true);
          if (!announced.has(announcement)) {
            announced.set(announcement, true);
            window.dispatchEvent(new CustomEvent("corporate:payment-update", { detail: { companyId: options.companyId, attempt: attempt } }));
          }
          if (["creating", "open", "processing"].includes(attempt.status) && pollCount++ < 7) pollTimer = setTimeout(check, 3000);
          else if (["succeeded", "reconciliation_required", "expired", "failed"].includes(attempt.status)) {
            try { sessionStorage.removeItem(RETURN_KEY); } catch (_) {}
          }
        } catch (_) {
          if (active()) message.textContent = "Payment status is unavailable. No outcome has been confirmed here. Retry the check before paying again.";
        } finally {
          checking = false;
          if (active()) refresh.disabled = false;
        }
      }
      refresh.addEventListener("click", function () { clearTimeout(pollTimer); pollCount = 0; check(); });
      returnPanel.append(message, refresh);
      target.append(returnPanel);
      await check();
      if (!active()) return;
      if (returnedAttempt) attempts.unshift(returnedAttempt);
    }
    if (!config.available) return;
    if (!historyAvailable) {
      target.append(node("p", "form-banner error", "Existing card payments could not be checked. Refresh before starting a payment, to avoid paying twice."));
      return;
    }
    const eligible = requests.filter(function (request) { return ["open", "partially_paid"].includes(request.status) && Number(request.amount) > Number(request.verified_amount || 0); });
    eligible.forEach(function (request) {
      const item = node("article", "portal-record-card");
      const body = node("div");
      body.append(node("b", "", (request.booking_reference || "Payment request") + " · quote v" + request.quote_version));
      const message = node("p");
      message.setAttribute("role", "status");
      const existing = attempts.filter(function (attempt) { return attempt.payment_request_id === request.id; }).sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); })[0];
      const financialHold = attempts.some(function (attempt) { return attempt.financial_hold === true && (attempt.payment_request_id === request.id || request.booking_id && attempt.booking_id === request.booking_id); });
      const blocked = existing && ["creating", "processing", "succeeded", "reconciliation_required"].includes(existing.status);
      message.textContent = financialHold ? statusCopy({ financial_hold: true }) : existing ? statusCopy(existing) : "Your outstanding amount and eligibility will be checked securely.";
      const button = node("button", "btn btn-primary btn-sm", existing && existing.status === "open" ? "Continue secure payment" : "Pay securely");
      button.type = "button";
      button.disabled = returnUnresolved || financialHold || !!blocked || !config.currencies.includes(String(request.currency).toUpperCase());
      paymentButtons.set(request.id, { button: button, message: message, bookingId: request.booking_id, financialHold: financialHold, blocked: !!blocked, currencyAvailable: config.currencies.includes(String(request.currency).toUpperCase()) });
      if (!financialHold && !config.currencies.includes(String(request.currency).toUpperCase())) message.textContent = "Card payment is not available for this currency. Use the bank transfer instructions or contact the desk.";
      let pending = false;
      let restart = !!existing && ["failed", "expired"].includes(existing.status);
      button.addEventListener("click", async function () {
        if (pending || button.disabled || !active()) return;
        pending = true;
        button.disabled = true;
        message.textContent = "Preparing secure checkout…";
        try {
          const startOptions = { newAttempt: restart };
          restart = false;
          const result = await start(request.id, startOptions);
          if (!active()) return;
          if (result.checkout_url && result.status === "open") location.assign(checkoutURL(result.checkout_url));
          else message.textContent = statusCopy(result);
        } catch (_) {
          if (active()) {
            message.textContent = "We could not confirm checkout. Retry this same request or refresh payment status before using another payment method.";
            button.textContent = "Retry checkout request";
            button.disabled = false;
          }
        } finally { pending = false; }
      });
      body.append(message, button);
      item.append(body);
      target.append(item);
    });
    if (!eligible.length && !returnId) target.append(node("p", "", "There is no outstanding payment request available for card payment."));
  }
  rememberReturn();
  document.addEventListener("click", function (event) { if (event.target.closest("#corp-logout-btn")) clear(); }, true);
  window.addEventListener("pagehide", clear);
  window.KridiyaCorporatePayments = { availability: availability, start: start, get: get, list: list, statusCopy: statusCopy, mount: mount, clear: clear };
  window.dispatchEvent(new CustomEvent("corporate:payments-ready"));
})();
