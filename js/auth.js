/* ============================================================
   Kridiya Travel - customer accounts
   Supabase Auth + Postgres profiles/bookings.
   Browser-safe config only: never place secret/service_role keys here.
   ============================================================ */
"use strict";

window.KridiyaAuth = (function () {
  const localRuntime = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
    ? (window.KRIDIYA_LOCAL_SUPABASE || {
        url: "http://127.0.0.1:57421",
        publishableKey: "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH",
        siteUrl: location.origin + "/"
      })
    : {};
  const SUPABASE_URL = localRuntime.url || "https://jmvqqpughlzeqrcyavwz.supabase.co";
  const SUPABASE_KEY = localRuntime.publishableKey || "sb_publishable_wiA9tSt74X-UQhW4yOXgIQ_lEUG1Q1Q";
  const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.js";
  const SUPABASE_INTEGRITY = "sha384-qafw21c/iciq0VXsi9FzkfoQv5I/V0iqE4lSNcKXPnW9/UTJLnv5CcN4FHxVLnKg";
  const SESSION_KEY = "kridiya_session";
  const PUBLIC_SITE_URL = localRuntime.siteUrl || "https://corporate.kridiyatravel.com/";

  let clientPromise = null;
  let cachedClient = null;

  function cleanEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function publicURL(path) {
    return new URL(path, PUBLIC_SITE_URL).href;
  }

  function nameFromProfile(profile, authUser) {
    return (
      (profile && profile.full_name) ||
      (authUser && authUser.user_metadata && (authUser.user_metadata.full_name || authUser.user_metadata.name)) ||
      (authUser && authUser.email && authUser.email.split("@")[0]) ||
      "Traveller"
    );
  }

  function session() {
    try {
      const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function setSession(user) {
    const payload = JSON.stringify({
      id: user.id || "",
      email: user.email || "",
      name: user.name || "Traveller",
      phone: user.phone || "",
      createdAt: user.createdAt || new Date().toISOString(),
      at: Date.now()
    });
    localStorage.setItem(SESSION_KEY, payload);
    sessionStorage.removeItem(SESSION_KEY);
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  }

  function loadSupabaseScript() {
    return new Promise(function (resolve, reject) {
      if (window.supabase && typeof window.supabase.createClient === "function") {
        resolve();
        return;
      }
      let existing = document.querySelector('script[data-supabase-js="true"]');
      if (existing && (existing.src !== SUPABASE_CDN || existing.integrity !== SUPABASE_INTEGRITY || existing.crossOrigin !== "anonymous" || existing.dataset.supabaseState === "failed")) {
        existing.remove();
        existing = null;
      }
      const script = existing || document.createElement("script");
      let settled = false;
      const timer = setTimeout(function () {
        finish(new Error("The account service took too long to load. Please check your connection and try again."));
      }, 12000);
      function finish(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        script.removeEventListener("load", onLoad);
        script.removeEventListener("error", onError);
        script.dataset.supabaseState = error ? "failed" : "ready";
        if (error) { script.remove(); reject(error); }
        else resolve();
      }
      function onLoad() {
        if (window.supabase && typeof window.supabase.createClient === "function") finish();
        else onError();
      }
      function onError() {
        finish(new Error("Could not load the account service. Please check your connection and try again."));
      }
      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });
      if (!existing) {
        script.src = SUPABASE_CDN;
        script.integrity = SUPABASE_INTEGRITY;
        script.crossOrigin = "anonymous";
        script.async = true;
        script.dataset.supabaseJs = "true";
        script.dataset.supabaseState = "loading";
        document.head.appendChild(script);
      } else if (script.dataset.supabaseState === "ready") {
        onLoad();
      }
    });
  }

  async function client() {
    if (cachedClient) return cachedClient;
    if (!clientPromise) {
      clientPromise = loadSupabaseScript().then(function () {
        cachedClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        });
        return cachedClient;
      }).catch(function (error) {
        clientPromise = null;
        throw error;
      });
    }
    return clientPromise;
  }

  async function profileFor(authUser) {
    if (!authUser) return null;
    const sb = await client();
    const result = await sb
      .from("profiles")
      .select("id, full_name, preferred_email, phone, whatsapp, preferred_currency, newsletter_opt_in, created_at")
      .eq("id", authUser.id)
      .maybeSingle();

    if (result.error) throw result.error;

    const profile = result.data || null;
    return {
      id: authUser.id,
      email: authUser.email || (profile && profile.preferred_email) || "",
      name: nameFromProfile(profile, authUser),
      phone: (profile && (profile.whatsapp || profile.phone)) || "",
      createdAt: (profile && profile.created_at) || authUser.created_at || new Date().toISOString()
    };
  }

  async function currentUser() {
    const sb = await client();
    const authResult = await sb.auth.getUser();
    if (authResult.error || !authResult.data || !authResult.data.user) {
      clearSession();
      return null;
    }
    const user = await profileFor(authResult.data.user);
    setSession(user);
    return user;
  }

  async function register(opts) {
    const sb = await client();
    const email = cleanEmail(opts.email);
    const name = String(opts.name || "").trim();
    const phone = String(opts.phone || "").trim();
    const result = await sb.auth.signUp({
      email: email,
      password: opts.password,
      options: {
        emailRedirectTo: publicURL("corporate-account.html"),
        data: {
          full_name: name,
          phone: phone,
          whatsapp: phone
        }
      }
    });

    if (result.error) throw result.error;

    const authUser = result.data && result.data.user;
    if (!result.data || !result.data.session) {
      clearSession();
      return {
        email: email,
        name: name,
        phone: phone,
        needsEmailConfirmation: true
      };
    }

    const user = await profileFor(authUser);
    setSession(user);
    return user;
  }

  async function login(email, password) {
    const sb = await client();
    const result = await sb.auth.signInWithPassword({
      email: cleanEmail(email),
      password: password
    });
    if (result.error) throw result.error;

    const user = await profileFor(result.data.user);
    setSession(user);
    return user;
  }

  async function logout() {
    const sb = await client();
    const result = await sb.auth.signOut();
    if (result.error) throw result.error;
    clearSession();
  }

  async function resetPassword(email) {
    const sb = await client();
    const result = await sb.auth.resetPasswordForEmail(cleanEmail(email), {
      redirectTo: publicURL("reset-password.html")
    });
    if (result.error) throw result.error;
  }

  async function completePasswordReset(nextPassword) {
    const sb = await client();
    const result = await sb.auth.updateUser({ password: nextPassword });
    if (result.error) throw result.error;
    await currentUser();
  }

  async function changePassword(email, current, next) {
    const sb = await client();
    const signIn = await sb.auth.signInWithPassword({
      email: cleanEmail(email),
      password: current
    });
    if (signIn.error) throw new Error("Your current password is incorrect.");

    const result = await sb.auth.updateUser({ password: next });
    if (result.error) throw result.error;
    await currentUser();
  }

  async function updateProfile(email, fields) {
    const user = await currentUser();
    if (!user) throw new Error("Please log in again.");

    const name = String(fields.name || "").trim();
    const phone = String(fields.phone || "").trim();
    const sb = await client();

    const result = await sb
      .from("profiles")
      .update({
        full_name: name,
        phone: phone,
        whatsapp: phone,
        preferred_email: cleanEmail(email || user.email)
      })
      .eq("id", user.id)
      .select("id, full_name, preferred_email, phone, whatsapp, created_at")
      .single();

    if (result.error) throw result.error;

    const updated = {
      id: user.id,
      email: user.email,
      name: result.data.full_name,
      phone: result.data.whatsapp || result.data.phone || "",
      createdAt: result.data.created_at || user.createdAt
    };
    setSession(updated);
    return updated;
  }

  async function listBookings() {
    const user = await currentUser();
    if (!user) return [];

    const sb = await client();
    const result = await sb
      .from("bookings")
      .select("id, booking_reference, service_type, title, route_or_destination, travel_start, travel_end, adults, children, infants, amount, currency, status, payment_status, document_status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (result.error) throw result.error;
    return result.data || [];
  }
  async function listBookingDocuments() {
    const user = await currentUser();
    if (!user) return [];
    const sb = await client();
    const result = await sb
      .from("booking_documents")
      .select("id, booking_id, document_type, file_name, storage_path, storage_provider, external_reference, visible_to_customer, created_at")
      .eq("user_id", user.id)
      .eq("visible_to_customer", true)
      .order("created_at", { ascending: false });
    if (result.error) return [];
    return result.data || [];
  }
  async function listCustomerPayments(bookingIds, enquiryIds) {
    const user = await currentUser();
    if (!user) return [];
    const ids = [];
    (bookingIds || []).forEach(function (id) { ids.push("booking_id.eq." + id); });
    (enquiryIds || []).forEach(function (id) { ids.push("enquiry_id.eq." + id); });
    if (!ids.length) return [];
    const sb = await client();
    const result = await sb
      .from("payments")
      .select("id, booking_id, enquiry_id, payment_reference, payment_direction, amount, currency, method, status, refund_amount, refund_reason, refund_method, refund_reference, refund_requested_at, refund_approved_at, refund_completed_at, created_at")
      .or(ids.join(","))
      .order("created_at", { ascending: false });
    if (result.error) return [];
    return result.data || [];
  }
  async function openBookingDocument(documentId, storagePath, storageProvider) {
    const user = await currentUser();
    if (!user) throw new Error("Please log in again.");
    if (!documentId || !storagePath) throw new Error("This document does not have a downloadable file yet.");
    const sb = await client();
    const check = await sb
      .from("booking_documents")
      .select("id, storage_path")
      .eq("id", documentId)
      .eq("user_id", user.id)
      .eq("visible_to_customer", true)
      .maybeSingle();
    if (check.error || !check.data || check.data.storage_path !== storagePath) {
      throw new Error("This document is not available for your account.");
    }
    if (storageProvider === "microsoft") {
      const sessionResult = await sb.auth.getSession();
      const token = sessionResult.data && sessionResult.data.session && sessionResult.data.session.access_token;
      if (!token) throw new Error("Please log in again.");
      const response = await fetch(SUPABASE_URL + "/functions/v1/microsoft-documents", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "download_booking_document", document_id: documentId })
      });
      if (!response.ok) {
        const failure = await response.json().catch(function () { return {}; });
        throw new Error(failure.error || "Could not prepare document download.");
      }
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = "";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(function () { URL.revokeObjectURL(downloadUrl); }, 30000);
      return;
    }
    const result = await sb.storage.from("booking-documents").createSignedUrl(storagePath, 300, { download: true });
    if (result.error || !result.data || !result.data.signedUrl) {
      throw new Error(result.error ? result.error.message : "Could not prepare document download.");
    }
    window.open(result.data.signedUrl, "_blank", "noopener");
  }

  async function openCorporateBookingDocument(bookingId, documentId, storagePath, storageProvider) {
    const user = await currentUser();
    if (!user) throw new Error("Please log in again.");
    if (!bookingId || !documentId) throw new Error("This corporate document is not downloadable yet.");
    const detail = await getMyCorporateBookingDetail(bookingId);
    const docs = detail && Array.isArray(detail.documents) ? detail.documents : [];
    const allowed = docs.some(function (doc) {
      return doc.id === documentId && doc.visible_to_customer === true;
    });
    if (!allowed) throw new Error("This document is not released to your corporate portal.");
    const sb = await client();
    if (storageProvider === "local_capture") {
      const result = await sb.rpc("download_corporate_travel_document", { p_document_id: documentId });
      if (result.error || !result.data) throw new Error("The document is unavailable or access has changed. Refresh and try again.");
      const file = result.data;
      const bytes = Uint8Array.from(atob(file.contents_base64.replace(/\s/g, "")), function (c) { return c.charCodeAt(0); });
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(function (n) { return n.toString(16).padStart(2, "0"); }).join("");
      if (hash !== file.sha256) throw new Error("The file could not be verified. Please retry.");
      const href = URL.createObjectURL(new Blob([bytes], { type: file.mime_type }));
      const anchor = document.createElement("a"); anchor.href = href; anchor.download = file.file_name;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(function () { URL.revokeObjectURL(href); }, 30000);
      // This records client receipt of checked bytes, never proof of disk save or email delivery.
      await sb.rpc("acknowledge_corporate_document_received", { p_access_event_id: file.access_event_id });
      return;
    }
    if (storageProvider === "microsoft") {
      const sessionResult = await sb.auth.getSession();
      const token = sessionResult.data && sessionResult.data.session && sessionResult.data.session.access_token;
      if (!token) throw new Error("Please log in again.");
      const response = await fetch(SUPABASE_URL + "/functions/v1/microsoft-documents", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          apikey: SUPABASE_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action: "download_booking_document", document_id: documentId })
      });
      if (!response.ok) {
        const failure = await response.json().catch(function () { return {}; });
        throw new Error(failure.error || "Could not prepare document download.");
      }
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = "";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(function () { URL.revokeObjectURL(downloadUrl); }, 30000);
      return;
    }
    const result = await sb.storage.from("booking-documents").createSignedUrl(storagePath, 300, { download: true });
    if (result.error || !result.data || !result.data.signedUrl) {
      throw new Error(result.error ? result.error.message : "Could not prepare document download.");
    }
    window.open(result.data.signedUrl, "_blank", "noopener");
  }

  async function listEnquiries() {
    const user = await currentUser();
    if (!user) return [];

    const sb = await client();
    const result = await sb
      .from("enquiries")
      .select("id, reference, service_type, status, summary, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (result.error) throw result.error;
    return result.data || [];
  }

  async function listRequests() {
    const user = await currentUser();
    if (!user) return [];
    const sb = await client();
    const result = await sb.from("enquiry_requests").select("*").order("created_at", { ascending: false });
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function listQuotes() {
    const user = await currentUser();
    if (!user) return [];
    const sb = await client();
    const result = await sb.from("quotes").select("*").order("created_at", { ascending: false });
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function respondToTextRequest(requestId, text) {
    const sb = await client();
    const result = await sb
      .from("enquiry_requests")
      .update({ response_text: text, responded_at: new Date().toISOString() })
      .eq("id", requestId)
      .select("*")
      .single();
    if (result.error) throw result.error;
    return result.data;
  }

  async function respondToFileRequest(requestId, file) {
    const user = await currentUser();
    if (!user) throw new Error("Please log in again.");
    const sb = await client();
    const path = user.id + "/" + requestId + "/" + file.name;
    const upload = await sb.storage.from("enquiry-uploads").upload(path, file, { upsert: true });
    if (upload.error) throw upload.error;
    const result = await sb
      .from("enquiry_requests")
      .update({ response_file_path: path, response_file_name: file.name, responded_at: new Date().toISOString() })
      .eq("id", requestId)
      .select("*")
      .single();
    if (result.error) throw result.error;
    return result.data;
  }

  async function respondToQuote(quoteId, status) {
    const sb = await client();
    const result = await sb.from("quotes").update({ status: status }).eq("id", quoteId).select("*").single();
    if (result.error) throw result.error;
    return result.data;
  }

  async function getMyCorporatePortal() {
    const user = await currentUser();
    if (!user) return [];
    const sb = await client();
    const result = await sb.rpc("get_my_corporate_portal");
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function corporateHistoryPage(name, corporateAccountId, cursor) {
    if (!corporateAccountId) throw new Error("Choose a company workspace first.");
    const user = await currentUser();
    if (!user) throw new Error("Please sign in again.");
    const sb = await client();
    const result = await sb.rpc(name, {
      p_corporate_account_id: corporateAccountId, p_limit: 50,
      p_after_created_at: cursor ? cursor.created_at : null, p_after_id: cursor ? cursor.id : null
    });
    if (result.error) throw result.error;
    const page = result.data;
    if (!page || !Array.isArray(page.rows) || typeof page.has_more !== "boolean"
      || (page.has_more && (!page.next_cursor || !page.next_cursor.id || !page.next_cursor.created_at))) {
      throw new Error("Company history is temporarily unavailable. Refresh to try again.");
    }
    const rows = page.rows;
    rows.hasMore = page.has_more;
    rows.nextCursor = page.next_cursor;
    return rows;
  }

  async function listMyCorporateBookings(corporateAccountId, cursor) {
    return corporateHistoryPage("list_my_corporate_bookings_page", corporateAccountId, cursor);
  }

  async function listMyCorporateQuotes(corporateAccountId, cursor) {
    return corporateHistoryPage("list_my_corporate_quotes_page", corporateAccountId, cursor);
  }

  async function respondMyCorporateQuote(quoteId, quoteVersion, status) {
    const user = await currentUser();
    if (!user) throw new Error("Please log in again.");
    const sb = await client();
    const result = await sb.rpc("respond_my_corporate_quote", {
      p_quote_id: quoteId,
      p_quote_version: Number(quoteVersion),
      p_status: status
    });
    if (result.error) throw result.error;
    return result.data;
  }

  async function requestMyCorporateQuoteRevision(quoteId, message) {
    const user = await currentUser();
    if (!user) throw new Error("Please log in again.");
    const sb = await client();
    const result = await sb.rpc("request_my_corporate_quote_revision", {
      p_quote_id: quoteId,
      p_message: message
    });
    if (result.error) throw result.error;
    return result.data;
  }

  async function getMyCorporateBookingDetail(bookingId) {
    const user = await currentUser();
    if (!user || !bookingId) return null;
    const sb = await client();
    const result = await sb.rpc("get_my_corporate_booking_detail", {
      p_booking_id: bookingId
    });
    if (result.error) throw result.error;
    return result.data || null;
  }

  async function createMyCorporateRequest(payload) {
    const user = await currentUser();
    if (!user) throw new Error("Please log in again.");
    const sb = await client();
    const result = await sb.rpc("create_my_corporate_request", {
      p_corporate_account_id: payload.corporateAccountId,
      p_title: payload.title,
      p_service_type: payload.serviceType,
      p_route_or_destination: payload.route || null,
      p_travel_start: payload.travelStart || null,
      p_travel_end: payload.travelEnd || null,
      p_customer_notes: payload.notes || null
    });
    if (result.error) throw result.error;
    return result.data;
  }

  async function createMyCorporatePolicyRequest(payload) {
    const user = await currentUser();
    if (!user) throw new Error("Please log in again.");
    const sb = await client();
    const result = await sb.rpc("create_my_corporate_policy_request", {
      p_corporate_account_id: payload.corporateAccountId,
      p_title: payload.title,
      p_service_type: payload.serviceType,
      p_route_or_destination: payload.route || null,
      p_travel_start: payload.travelStart || null,
      p_travel_end: payload.travelEnd || null,
      p_customer_notes: payload.notes || null,
      p_requested_budget: payload.requestedBudget == null ? null : payload.requestedBudget,
      p_requested_cabin: payload.requestedCabin || null,
      p_requested_hotel_stars: payload.requestedHotelStars == null ? null : payload.requestedHotelStars,
      p_lpo_ready: !!payload.lpoReady
    });
    if (result.error) throw result.error;
    return result.data;
  }

  async function listMyCorporateDeskCases(corporateAccountId) {
    const sb = await client();
    const result = await sb.rpc("list_my_corporate_desk_cases", { p_corporate_account_id: corporateAccountId, p_limit: 100 });
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function createMyCorporateDeskCase(payload) {
    const sb = await client();
    const result = await sb.rpc("create_my_corporate_desk_case", { p_corporate_account_id: payload.corporateAccountId, p_category: payload.category, p_urgency: payload.urgency, p_subject: payload.subject, p_description: payload.description, p_booking_id: payload.bookingId || null });
    if (result.error) throw result.error;
    return result.data;
  }

  async function getCorporateDeskCase(id) { const sb=await client(); const r=await sb.rpc("get_corporate_desk_case",{p_case_id:id}); if(r.error)throw r.error; return r.data; }
  async function replyCorporateDeskCase(id,version,body,reopen) { const sb=await client(); const r=await sb.rpc("reply_my_corporate_desk_case",{p_case_id:id,p_expected_version:version,p_body:body,p_reopen:!!reopen}); if(r.error)throw r.error; return r.data; }
  async function acknowledgeCorporateHandover(id) { const sb=await client(); const r=await sb.rpc("acknowledge_my_corporate_document_handover",{p_document_id:id,p_confirm_received:true}); if(r.error)throw r.error; return r.data; }

  async function listMyCorporateTravellers(corporateAccountId) { const sb=await client(); const r=await sb.rpc("list_my_corporate_travellers",{p_corporate_account_id:corporateAccountId}); if(r.error)throw r.error; return r.data||[]; }
  async function saveMyCorporateTraveller(payload) { const sb=await client(); const r=await sb.rpc("save_my_corporate_traveller",{p_corporate_account_id:payload.corporateAccountId,p_traveller_id:payload.id||null,p_full_name:payload.fullName,p_date_of_birth:payload.dateOfBirth||null,p_nationality:payload.nationality||null,p_passport_number:payload.passportNumber||null,p_passport_expiry:payload.passportExpiry||null,p_notes:payload.notes||null,p_expected_updated_at:payload.expectedUpdatedAt||null}); if(r.error)throw r.error; return r.data; }
  async function importMyCorporateTravellers(corporateAccountId,rows) { const sb=await client(); const r=await sb.rpc("import_my_corporate_travellers",{p_corporate_account_id:corporateAccountId,p_rows:rows}); if(r.error)throw r.error; return r.data; }
  async function archiveMyCorporateTraveller(corporateAccountId,id,updatedAt) { const sb=await client(); const r=await sb.rpc("archive_my_corporate_traveller",{p_corporate_account_id:corporateAccountId,p_traveller_id:id,p_expected_updated_at:updatedAt}); if(r.error)throw r.error; }
  async function listMyCorporateFinanceEvidence(corporateAccountId) { const sb=await client(); const r=await sb.rpc("list_my_corporate_finance_evidence",{p_corporate_account_id:corporateAccountId}); if(r.error)throw r.error; return r.data||[]; }
  async function submitMyCorporateFinanceEvidence(payload) { const sb=await client(),user=await currentUser(); if(!user)throw new Error("Please log in again."); const ext=(payload.file.name.split(".").pop()||"file").replace(/[^a-z0-9]/gi,"").toLowerCase(),token=(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2)),path=user.id+"/"+payload.bookingId+"/"+token+"."+ext; const upload=await sb.storage.from("corporate-finance-evidence").upload(path,payload.file,{upsert:false,contentType:payload.file.type}); if(upload.error)throw upload.error; const r=await sb.rpc("attach_my_corporate_finance_evidence",{p_corporate_account_id:payload.corporateAccountId,p_booking_id:payload.bookingId,p_evidence_type:payload.evidenceType,p_reference:payload.reference||null,p_storage_path:path,p_file_name:payload.file.name,p_mime_type:payload.file.type,p_size_bytes:payload.file.size}); if(r.error){await sb.storage.from("corporate-finance-evidence").remove([path]);throw r.error;} return r.data; }
  async function listMyCorporatePaymentRequests(corporateAccountId) { const sb=await client(); const r=await sb.rpc("list_my_corporate_payment_requests",{p_corporate_account_id:corporateAccountId}); if(r.error)throw r.error; return r.data||[]; }
  async function submitMyCorporatePaymentEvidence(payload) { const sb=await client(),user=await currentUser(); if(!user)throw new Error("Please log in again."); let path=null,file=payload.file||null;if(file){const ext=(file.name.split(".").pop()||"file").replace(/[^a-z0-9]/gi,"").toLowerCase(),token=(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2));path=user.id+"/"+payload.bookingId+"/"+token+"."+ext;const upload=await sb.storage.from("corporate-finance-evidence").upload(path,file,{upsert:false,contentType:file.type});if(upload.error)throw upload.error;}const r=await sb.rpc("submit_my_corporate_payment_evidence",{p_payment_request_id:payload.paymentRequestId,p_evidence_type:payload.evidenceType,p_reference:payload.reference||null,p_customer_declaration:payload.customerDeclaration||null,p_claimed_amount:payload.claimedAmount||null,p_currency:payload.currency||null,p_storage_path:path,p_file_name:file?file.name:null,p_mime_type:file?file.type:null,p_size_bytes:file?file.size:null});if(r.error){if(path)await sb.storage.from("corporate-finance-evidence").remove([path]);throw r.error;}return r.data; }
  async function listMyCorporateBranches(corporateAccountId){const sb=await client();const r=await sb.rpc("list_my_corporate_branches",{p_corporate_account_id:corporateAccountId});if(r.error)throw r.error;return r.data||[];}
  async function listMyCorporateTravelPolicies(corporateAccountId){const sb=await client();const r=await sb.rpc("list_my_corporate_travel_policies",{p_corporate_account_id:corporateAccountId});if(r.error)throw r.error;return r.data||[];}
  async function listMyCorporateTravelDisruptions(corporateAccountId){const sb=await client();const r=await sb.rpc("list_my_corporate_travel_disruptions",{p_corporate_account_id:corporateAccountId,p_limit:100});if(r.error)throw r.error;return r.data||[];}

  function getUser(email) {
    const cached = session();
    if (!cached) return null;
    return !email || cleanEmail(email) === cleanEmail(cached.email) ? cached : null;
  }

  function passwordIssue(pw) {
    if (pw.length < 8) return "Password must be at least 8 characters.";
    if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return "Use at least one letter and one number.";
    return "";
  }

  function passwordStrength(pw) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^a-zA-Z0-9]/.test(pw)) score++;
    return score;
  }

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statusLabel(value) {
    return String(value || "enquiry").replace(/_/g, " ").replace(/\b\w/g, function (c) {
      return c.toUpperCase();
    });
  }

  return {
    client: client,
    session: session,
    currentUser: currentUser,
    register: register,
    login: login,
    logout: logout,
    resetPassword: resetPassword,
    completePasswordReset: completePasswordReset,
    changePassword: changePassword,
    updateProfile: updateProfile,
    getUser: getUser,
    listBookings: listBookings,
    listEnquiries: listEnquiries,
    listBookingDocuments: listBookingDocuments,
    openBookingDocument: openBookingDocument,
    openCorporateBookingDocument: openCorporateBookingDocument,
    listCustomerPayments: listCustomerPayments,
    listRequests: listRequests,
    listQuotes: listQuotes,
    respondToTextRequest: respondToTextRequest,
    respondToFileRequest: respondToFileRequest,
    respondToQuote: respondToQuote,
    getMyCorporatePortal: getMyCorporatePortal,
    listMyCorporateBookings: listMyCorporateBookings,
    listMyCorporateQuotes: listMyCorporateQuotes,
    respondMyCorporateQuote: respondMyCorporateQuote,
    requestMyCorporateQuoteRevision: requestMyCorporateQuoteRevision,
    getMyCorporateBookingDetail: getMyCorporateBookingDetail,
    createMyCorporateRequest: createMyCorporateRequest,
    createMyCorporatePolicyRequest: createMyCorporatePolicyRequest,
    listMyCorporateDeskCases: listMyCorporateDeskCases,
    getCorporateDeskCase: getCorporateDeskCase,
    replyCorporateDeskCase: replyCorporateDeskCase,
    acknowledgeCorporateHandover: acknowledgeCorporateHandover,
    createMyCorporateDeskCase: createMyCorporateDeskCase,
    listMyCorporateTravellers: listMyCorporateTravellers,
    saveMyCorporateTraveller: saveMyCorporateTraveller,
    importMyCorporateTravellers: importMyCorporateTravellers,
    archiveMyCorporateTraveller: archiveMyCorporateTraveller,
    listMyCorporateFinanceEvidence: listMyCorporateFinanceEvidence,
    submitMyCorporateFinanceEvidence: submitMyCorporateFinanceEvidence,
    listMyCorporatePaymentRequests: listMyCorporatePaymentRequests,
    submitMyCorporatePaymentEvidence: submitMyCorporatePaymentEvidence,
    listMyCorporateBranches: listMyCorporateBranches,
    listMyCorporateTravelPolicies: listMyCorporateTravelPolicies,
    listMyCorporateTravelDisruptions: listMyCorporateTravelDisruptions,
    passwordIssue: passwordIssue,
    passwordStrength: passwordStrength,
    escapeHTML: escapeHTML,
    statusLabel: statusLabel
  };
})();

/* ============================================================
   Page wiring (login / register / account / reset password)
   ============================================================ */
(function () {
  const page = document.body.dataset.page;
  let corporateHistory = null;
  let corporateDetailGeneration = 0;
  let corporateDetailCache = new Map();
  let corporateLoadedDetailIds = new Set();

  function banner(form, msg, kind) {
    const el = form.querySelector(".form-banner");
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || "";
    el.className = "form-banner " + (kind || "error");
  }

  function toast(msg) {
    if (!msg) return;
    let el = document.querySelector(".site-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "site-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () {
      el.classList.remove("show");
    }, 3200);
  }

  function readableErrorValue(value, depth) {
    if (!value || depth > 2) return "";
    if (typeof value === "string") return value.trim();
    if (value instanceof Error && value.message) return value.message.trim();

    const keys = ["message", "error_description", "description", "details", "hint", "msg"];
    for (let i = 0; i < keys.length; i++) {
      const text = readableErrorValue(value[keys[i]], depth + 1);
      if (text) return text;
    }

    const nested = readableErrorValue(value.error, depth + 1);
    if (nested) return nested;

    try {
      const text = JSON.stringify(value);
      return text && text !== "{}" ? text : "";
    } catch (e) {
      return "";
    }
  }

  function errorMessage(err, fallback) {
    const text = readableErrorValue(err, 0);
    if (!text || text === "{}") return fallback;
    if (/already registered|user already exists|already been registered/i.test(text)) {
      return "An account already exists for this email. Please log in or use password reset.";
    }
    if (/database error saving new user|error saving new user/i.test(text)) {
      return "We could not finish account setup right now. Please try again, or contact Kridiya Travel on WhatsApp so we can create it for you.";
    }
    if (/failed to fetch|network|load failed/i.test(text)) {
      return "Could not reach the account service. Please check your internet connection and try again.";
    }
    if (/bookings_title_length/i.test(text)) {
      return "Request title must be at least 3 characters. Use a clear title like DXB to London staff trip.";
    }
    return text;
  }

  function busy(form, on, label) {
    const btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    btn.disabled = on;
    btn.innerHTML = on ? '<span class="spinner" aria-hidden="true"></span> ' + label : btn.dataset.label;
  }

  function initPwToggles(scope) {
    (scope || document).querySelectorAll(".pw-toggle").forEach(function (t) {
      t.addEventListener("click", function () {
        const input = t.parentElement.querySelector("input");
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        t.textContent = show ? "HIDE" : "SHOW";
        t.setAttribute("aria-label", show ? "Hide password" : "Show password");
        t.setAttribute("aria-pressed", String(show));
      });
    });
  }

  function refreshHeaderName(user) {
    const btn = document.getElementById("account-btn");
    if (btn && user && user.name) {
      btn.textContent = "Hi, " + user.name.split(" ")[0];
      btn.href = "corporate-account.html";
    }
  }

  async function existingUserOrNull() {
    try {
      return await KridiyaAuth.currentUser();
    } catch (e) {
      return null;
    }
  }

  function loginRedirectTarget() {
    const dest = new URLSearchParams(location.search).get("next");
    return dest && /^[a-z-]+\.html$/.test(dest) ? dest : "corporate-account.html";
  }

  if (page === "login") {
    document.addEventListener("DOMContentLoaded", async function () {
      if (await existingUserOrNull()) {
        location.replace(loginRedirectTarget());
        return;
      }

      const form = document.getElementById("login-form");
      initPwToggles(form);
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (!validateForm(form)) return;
        banner(form, "");
        busy(form, true, "Signing in...");
        try {
          const user = await KridiyaAuth.login(form.email.value, form.password.value);
          toast("Welcome back, " + user.name.split(" ")[0] + "!");
          location.href = loginRedirectTarget();
        } catch (err) {
          banner(form, errorMessage(err, "Could not sign in. Please check your email and password."), "error");
          busy(form, false);
        }
      });

      const resetBtn = document.getElementById("reset-password-btn");
      if (resetBtn) {
        resetBtn.addEventListener("click", async function () {
          const email = form.email.value.trim();
          if (!email) {
            setFieldError(form.email, "Enter your email first, then click reset.");
            form.email.focus();
            return;
          }
          banner(form, "");
          resetBtn.disabled = true;
          resetBtn.textContent = "Sending reset link...";
          try {
            await KridiyaAuth.resetPassword(email);
            banner(form, "Password reset email sent. Check your inbox.", "success");
          } catch (err) {
            banner(form, errorMessage(err, "Could not send the password reset email. Please try again."), "error");
          }
          resetBtn.disabled = false;
          resetBtn.textContent = "Send password reset email";
        });
      }
    });
  }

  if (page === "register") {
    document.addEventListener("DOMContentLoaded", async function () {
      if (await existingUserOrNull()) {
        location.replace("corporate-account.html");
        return;
      }

      const form = document.getElementById("register-form");
      initPwToggles(form);

      const pwInput = form.password;
      const meter = form.querySelector(".pw-meter i");
      pwInput.addEventListener("input", function () {
        const s = KridiyaAuth.passwordStrength(pwInput.value);
        meter.style.width = (s / 5) * 100 + "%";
        meter.className = s >= 4 ? "strong" : s >= 2 ? "ok" : "";
      });

      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (!validateForm(form)) return;
        const issue = KridiyaAuth.passwordIssue(form.password.value);
        if (issue) {
          setFieldError(form.password, issue);
          form.password.focus();
          return;
        }
        if (form.password.value !== form.confirm.value) {
          setFieldError(form.confirm, "Passwords do not match.");
          form.confirm.focus();
          return;
        }
        banner(form, "");
        busy(form, true, "Creating account...");
        try {
          const user = await KridiyaAuth.register({
            name: form.name.value,
            email: form.email.value,
            phone: form.phone.value,
            password: form.password.value
          });

          if (user.needsEmailConfirmation) {
            banner(form, "Account created. Check your email and click the confirmation link before logging in.", "success");
            form.reset();
            meter.style.width = "0";
            busy(form, false);
            return;
          }

          toast("Welcome to Kridiya Travel, " + user.name.split(" ")[0] + "!");
          location.href = "corporate-account.html";
        } catch (err) {
          banner(form, errorMessage(err, "Could not create the account. Please try again or contact Kridiya Travel."), "error");
          busy(form, false);
        }
      });
    });
  }

  function requestsHTML(requests) {
    if (!requests.length) return "";
    return '<div class="enq-extra customer-action-list"><h4>Action needed from you</h4>' + requests.map(function (r) {
      if (r.responded_at) {
        const answer = r.kind === "file"
          ? (r.response_file_name ? "Uploaded: " + KridiyaAuth.escapeHTML(r.response_file_name) : "Uploaded")
          : KridiyaAuth.escapeHTML(r.response_text || "");
        return '<p class="form-note enq-extra-done">' + icon("check") + " " + KridiyaAuth.escapeHTML(r.label) + " - " + answer + "</p>";
      }
      if (r.kind === "file") {
        return '<form class="cust-request-form" data-request-id="' + r.id + '" data-kind="file">' +
          "<label>" + KridiyaAuth.escapeHTML(r.label) + "</label>" +
          '<input type="file" required>' +
          '<button class="btn btn-outline" type="submit">Upload</button>' +
          "</form>";
      }
      return '<form class="cust-request-form" data-request-id="' + r.id + '" data-kind="text">' +
        "<label>" + KridiyaAuth.escapeHTML(r.label) + "</label>" +
        '<input type="text" required placeholder="Your answer">' +
        '<button class="btn btn-outline" type="submit">Send</button>' +
        "</form>";
    }).join("") + "</div>";
  }

  function money(v, c) {
    return KridiyaAuth.escapeHTML((c || "AED") + " " + Number(v || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }

  function docPresentation(doc) {
    const source = String([doc.document_type, doc.file_name, doc.external_reference].filter(Boolean).join(" ")).toLowerCase();
    if (/ticket|e-?ticket|flight/.test(source)) return { type: "ticket", label: "Travel ticket" };
    if (/voucher|hotel|stay|transfer|tour|package/.test(source)) return { type: "voucher", label: "Voucher" };
    if (/invoice|tax|receipt|bill/.test(source)) return { type: "invoice", label: "Invoice" };
    if (/visa|permit/.test(source)) return { type: "visa", label: "Visa document" };
    if (/insurance|policy/.test(source)) return { type: "policy", label: "Policy" };
    return { type: "document", label: KridiyaAuth.statusLabel(doc.document_type || "Document") };
  }

  function expectedDocumentTypes(serviceType) {
    const service = String(serviceType || "").toLowerCase();
    if (/visa/.test(service)) return ["Passport copy", "Photo", "Visa form", "Approval/email"];
    if (/hotel|holiday|package|umrah|mice|event|group/.test(service)) return ["Traveller list", "Voucher", "Invoice/receipt", "Policy if included"];
    if (/insurance/.test(service)) return ["Passport copy", "Policy", "Invoice/receipt"];
    if (/transfer/.test(service)) return ["Pickup details", "Voucher", "Driver/contact note"];
    return ["Passport copy", "Ticket or PNR", "Approval email", "Receipt/invoice"];
  }

  function documentChecklistHTML(booking, docs) {
    const releasedTypes = (docs || []).map(function (doc) {
      return String([doc.document_type, doc.file_name, doc.external_reference].filter(Boolean).join(" ")).toLowerCase();
    }).join(" ");
    const expected = expectedDocumentTypes(booking.service_type);
    const rows = expected.map(function (label) {
      const key = label.toLowerCase().replace(/\/.*/, "");
      const done = releasedTypes.indexOf(key) !== -1 || (key === "ticket or pnr" && /ticket|pnr/.test(releasedTypes)) || (key === "invoice" && /invoice|receipt/.test(releasedTypes));
      return '<span class="' + (done ? "is-ready" : "") + '"><i></i>' + KridiyaAuth.escapeHTML(label) + '</span>';
    }).join("");
    return '<article class="document-check-card">' +
      '<div><small>' + KridiyaAuth.escapeHTML(booking.booking_reference || "Corporate booking") + '</small><b>' + KridiyaAuth.escapeHTML(booking.title || KridiyaAuth.statusLabel(booking.service_type || "Travel record")) + '</b><p>Files appear here after the travel desk releases them to your company.</p></div>' +
      '<div class="document-check-list">' + rows + '</div>' +
    '</article>';
  }

  function quoteDetailRows(q) {
    const od = (q.option_data && typeof q.option_data === "object") ? q.option_data : {};
    let rows = Object.keys(od).map(function (k) {
      return od[k] ? '<div class="quote-row"><span class="quote-k">' + KridiyaAuth.escapeHTML(k) + '</span><span class="quote-v">' + KridiyaAuth.escapeHTML(String(od[k])) + "</span></div>" : "";
    }).join("");
    if (!rows) {
      const legacy = [];
      if (q.airline || q.stops) legacy.push(["Flight", [q.airline, q.stops].filter(Boolean).join(" / ")]);
      if (q.outbound) legacy.push(["Onward", q.outbound]);
      if (q.inbound) legacy.push(["Return", q.inbound]);
      if (q.baggage) legacy.push(["Baggage", q.baggage]);
      rows = legacy.map(function (r) {
        return '<div class="quote-row"><span class="quote-k">' + KridiyaAuth.escapeHTML(r[0]) + '</span><span class="quote-v">' + KridiyaAuth.escapeHTML(r[1]) + "</span></div>";
      }).join("");
    }
    return rows;
  }
  function quotesHTML(quotes) {
    if (!quotes.length) return "";
    const sortedQuotes = quotes.slice().sort(function (a, b) {
      const byPrice = Number(a.price_amount || 0) - Number(b.price_amount || 0);
      if (byPrice) return byPrice;
      return String(a.created_at || "").localeCompare(String(b.created_at || ""));
    });
    function displayTitle(q, index) {
      const name = String(q.title || "").replace(/^Option\s+\d+\s*:\s*/i, "").trim();
      return "Option " + (index + 1) + (name ? ": " + name : "");
    }
    return '<div class="enq-extra quote-list">' + sortedQuotes.map(function (q, index) {
      const amount = money(q.price_amount, q.currency);
      const validity = q.valid_until
        ? new Date(q.valid_until).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        : "";
      const details = quoteDetailRows(q);
      const adds = Array.isArray(q.addons) ? q.addons : [];
      const addonsHtml = adds.length
        ? '<div class="quote-addons"><span class="quote-addons-title">Optional add-ons</span>' + adds.map(function (a) {
            return '<div class="quote-row"><span class="quote-k">' + KridiyaAuth.escapeHTML(a.name) + '</span><span class="quote-v">' + (a.price != null ? money(a.price, q.currency) : "") + "</span></div>";
          }).join("") + "</div>"
        : "";
      const termsHtml = q.terms
        ? '<details class="quote-terms"><summary>Terms &amp; conditions</summary><ul>' + String(q.terms).split("\n").map(function (t) {
            t = t.replace(/^[-*]\s*/, "").trim();
            return t ? "<li>" + KridiyaAuth.escapeHTML(t) + "</li>" : "";
          }).join("") + "</ul></details>"
        : "";

      if (q.status === "sent") {
        return '<div class="quote-card">' +
          '<div class="quote-card-head"><h4>' + KridiyaAuth.escapeHTML(displayTitle(q, index)) + '</h4><div class="quote-price">' + amount + "</div></div>" +
          (details ? '<div class="quote-details">' + details + "</div>" : "") +
          addonsHtml +
          termsHtml +
          (validity ? '<p class="quote-valid">Valid until ' + KridiyaAuth.escapeHTML(validity) + "</p>" : "") +
          '<div class="quote-actions">' +
            '<button class="btn btn-primary" type="button" data-quote-id="' + q.id + '" data-action="accepted">Accept quote</button>' +
            '<button class="btn btn-outline" type="button" data-quote-id="' + q.id + '" data-action="declined">Decline</button>' +
          "</div></div>";
      }
      return '<div class="quote-card quote-card-done">' +
        '<div class="quote-card-head"><h4>' + KridiyaAuth.escapeHTML(displayTitle(q, index)) + '</h4><div class="quote-price">' + amount + "</div></div>" +
        (details ? '<div class="quote-details">' + details + "</div>" : "") +
        '<p class="quote-status-line">' + icon("check") + " " + KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(q.status)) + "</p></div>";
    }).join("") + "</div>";
  }
  function customerDocsHTML(docs) {
    if (!docs.length) return '<div class="enq-extra customer-doc-list customer-empty-list"><h4>Documents</h4><p>No customer-visible documents have been released yet.</p></div>';
    return '<div class="enq-extra customer-doc-list"><h4>Documents</h4>' + docs.map(function (d) {
      const created = d.created_at ? new Date(d.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
      const view = docPresentation(d);
      return '<div class="customer-doc-ticket doc-' + KridiyaAuth.escapeHTML(view.type) + '">' +
        '<div class="doc-ticket-mark"><span>' + KridiyaAuth.escapeHTML(view.label) + '</span></div>' +
        '<div class="doc-ticket-body"><b>' + KridiyaAuth.escapeHTML(d.file_name || view.label) + '</b>' +
        '<span>' + KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(d.document_type || view.label)) + (created ? " / " + KridiyaAuth.escapeHTML(created) : "") + '</span>' +
        (d.external_reference ? '<small>Reference: ' + KridiyaAuth.escapeHTML(d.external_reference) + '</small>' : '') + '</div>' +
        (d.storage_path
          ? '<button class="btn btn-outline btn-sm customer-doc-download" type="button" data-document-id="' + KridiyaAuth.escapeHTML(d.id) + '" data-storage-path="' + KridiyaAuth.escapeHTML(d.storage_path) + '" data-storage-provider="' + KridiyaAuth.escapeHTML(d.storage_provider || "supabase") + '">Download</button>'
          : '<span class="customer-row-state">Released</span>') + '</div>';
    }).join("") + "</div>";
  }

  function customerPaymentsHTML(payments) {
    if (!payments.length) return '<div class="enq-extra customer-payment-list customer-empty-list"><h4>Payments and refunds</h4><p>No customer payment or refund updates yet.</p></div>';
    return '<div class="enq-extra customer-payment-list"><h4>Payments and refunds</h4>' + payments.map(function (p) {
      const status = KridiyaAuth.statusLabel(p.status);
      const amount = money(p.refund_amount || p.amount, p.currency);
      const isRefund = /refund/i.test(String(p.status || "")) || p.refund_amount;
      const ref = p.refund_reference || p.payment_reference || "";
      return '<div class="customer-mini-row customer-payment-row"><div><b>' + (isRefund ? "Refund" : "Payment") + ": " + amount + '</b><span>' + KridiyaAuth.escapeHTML(status) + ' / ' + KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(p.method)) + '</span>' + (ref ? '<small>Reference: ' + KridiyaAuth.escapeHTML(ref) + '</small>' : '') + (p.refund_reason ? '<small>' + KridiyaAuth.escapeHTML(p.refund_reason) + '</small>' : '') + '</div><span class="customer-row-state">' + KridiyaAuth.escapeHTML(status) + '</span></div>';
    }).join("") + "</div>";
  }

  function wireEnquiryExtras(listEl) {
    listEl.addEventListener("click", async function (e) {
      const btn = e.target.closest(".customer-doc-download");
      if (!btn) return;
      btn.disabled = true;
      const old = btn.textContent;
      btn.textContent = "Preparing...";
      try {
        await KridiyaAuth.openBookingDocument(btn.dataset.documentId, btn.dataset.storagePath, btn.dataset.storageProvider);
      } catch (err) {
        toast(errorMessage(err, "Could not prepare the document."));
      }
      btn.disabled = false;
      btn.textContent = old;
    });
    listEl.addEventListener("submit", async function (e) {
      const form = e.target.closest(".cust-request-form");
      if (!form) return;
      e.preventDefault();
      const id = form.dataset.requestId;
      const kind = form.dataset.kind;
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        if (kind === "file") {
          const file = form.querySelector('input[type="file"]').files[0];
          if (!file) { btn.disabled = false; return; }
          await KridiyaAuth.respondToFileRequest(id, file);
        } else {
          const value = form.querySelector('input[type="text"]').value.trim();
          if (!value) { btn.disabled = false; return; }
          await KridiyaAuth.respondToTextRequest(id, value);
        }
        toast("Sent - thank you.");
        location.reload();
      } catch (err) {
        btn.disabled = false;
        toast(errorMessage(err, "Could not send your reply."));
      }
    });

    listEl.addEventListener("click", async function (e) {
      const btn = e.target.closest("[data-quote-id]");
      if (!btn) return;
      btn.disabled = true;
      try {
        await KridiyaAuth.respondToQuote(btn.dataset.quoteId, btn.dataset.action);
        toast(btn.dataset.action === "accepted" ? "Quote accepted." : "Quote declined.");
        location.reload();
      } catch (err) {
        btn.disabled = false;
        toast(errorMessage(err, "Could not update the quote."));
      }
    });
  }

  if (page === "account") {
    document.addEventListener("DOMContentLoaded", async function () {
      const user = await KridiyaAuth.currentUser();
      if (!user) {
        location.replace("login.html?next=corporate-account.html");
        return;
      }

      document.getElementById("acc-avatar").textContent = (user.name || "T").trim().charAt(0).toUpperCase();
      document.getElementById("acc-name").textContent = user.name;
      document.getElementById("acc-email").textContent = user.email;
      const since = user.createdAt ? new Date(user.createdAt) : null;
      document.getElementById("acc-since").textContent = since
        ? "Member since " + since.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
        : "";
      refreshHeaderName(user);

      const listEl = document.getElementById("enq-list");
      try {
        let results = await Promise.all([
          KridiyaAuth.listBookings(),
          KridiyaAuth.listEnquiries(),
          KridiyaAuth.listRequests(),
          KridiyaAuth.listQuotes(),
          KridiyaAuth.listBookingDocuments()
        ]);
        const bookings = results[0];
        const enquiries = results[1];
        const docs = results[4] || [];
        const payments = await KridiyaAuth.listCustomerPayments(
          bookings.map(function (b) { return b.id; }),
          enquiries.map(function (e) { return e.id; })
        );
        const requestsByEnquiry = {};
        results[2].forEach(function (r) {
          if (!requestsByEnquiry[r.enquiry_id]) requestsByEnquiry[r.enquiry_id] = [];
          requestsByEnquiry[r.enquiry_id].push(r);
        });
        const quotesByEnquiry = {};
        results[3].forEach(function (q) {
          if (!quotesByEnquiry[q.enquiry_id]) quotesByEnquiry[q.enquiry_id] = [];
          quotesByEnquiry[q.enquiry_id].push(q);
        });
        const docsByBooking = {};
        docs.forEach(function (d) {
          if (!docsByBooking[d.booking_id]) docsByBooking[d.booking_id] = [];
          docsByBooking[d.booking_id].push(d);
        });
        const paymentsByBooking = {};
        const paymentsByEnquiry = {};
        payments.forEach(function (p) {
          if (p.booking_id) {
            if (!paymentsByBooking[p.booking_id]) paymentsByBooking[p.booking_id] = [];
            paymentsByBooking[p.booking_id].push(p);
          }
          if (p.enquiry_id) {
            if (!paymentsByEnquiry[p.enquiry_id]) paymentsByEnquiry[p.enquiry_id] = [];
            paymentsByEnquiry[p.enquiry_id].push(p);
          }
        });

        const openRequests = results[2].filter(function (r) {
          return !/submitted|completed|done|closed/i.test(String(r.status || ""));
        });
        const activeQuotes = results[3].filter(function (q) {
          return !/declined|expired|cancelled/i.test(String(q.status || ""));
        });

        const combined = enquiries.map(function (e) {
          return {
            id: e.id,
            isEnquiry: true,
            reference: e.reference,
            status: e.status,
            title: KridiyaAuth.statusLabel(e.service_type) + " enquiry",
            detail: e.summary,
            paxLabel: "",
            amount: "Quote pending",
            created_at: e.created_at
          };
        }).concat(bookings.map(function (booking) {
          const pax = (booking.adults || 0) + (booking.children || 0) + (booking.infants || 0);
          return {
            id: booking.id,
            isEnquiry: false,
            reference: booking.booking_reference,
            status: booking.status,
            title: booking.title,
            detail: booking.route_or_destination || booking.service_type,
            paxLabel: pax ? pax + " traveller" + (pax === 1 ? "" : "s") : "",
            amount: booking.amount ? (booking.currency + " " + Number(booking.amount).toLocaleString("en-GB")) : "Quote pending",
            paymentStatus: booking.payment_status,
            documentStatus: booking.document_status,
            created_at: booking.created_at
          };
        })).sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });

        const summaryBookings = document.getElementById("summary-bookings");
        if (summaryBookings) summaryBookings.textContent = String(combined.length);
        renderPortalOverview(combined, activeQuotes, openRequests);

        if (combined.length) {
          listEl.innerHTML = combined.map(function (item) {
            const created = new Date(item.created_at);
            const requests = item.isEnquiry ? (requestsByEnquiry[item.id] || []) : [];
            const quotes = item.isEnquiry ? (quotesByEnquiry[item.id] || []) : [];
            const itemDocs = item.isEnquiry ? [] : (docsByBooking[item.id] || []);
            const itemPayments = item.isEnquiry ? (paymentsByEnquiry[item.id] || []) : (paymentsByBooking[item.id] || []);
            const itemType = item.isEnquiry ? "Enquiry" : "Booking";
            const attention = requests.length ? "Needs your reply" : quotes.length ? "Quote ready" : itemDocs.length ? "Documents released" : itemPayments.length ? "Payment updated" : "In progress";
            const detailText = item.detail || "Team will update";
            return '<article class="enq-item">' +
              '<div class="enq-top"><div><span class="account-chip">' + KridiyaAuth.escapeHTML(itemType) + '</span><b>' + KridiyaAuth.escapeHTML(item.title || item.reference || itemType) + "</b></div>" +
              '<time datetime="' + KridiyaAuth.escapeHTML(item.created_at) + '">' +
              created.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) +
              "</time></div>" +
              '<div class="customer-status-strip"><span>' + KridiyaAuth.escapeHTML(attention) + '</span><small>' + KridiyaAuth.escapeHTML(item.reference || "Reference pending") + '</small></div>' +
              '<div class="account-item-grid">' +
                '<span class="account-fact"><small>Reference</small><b>' + KridiyaAuth.escapeHTML(item.reference || "Pending") + '</b></span>' +
                '<span class="account-fact"><small>Status</small><b>' + KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(item.status)) + '</b></span>' +
                '<span class="account-fact account-fact-amount"><small>Amount</small><b>' + KridiyaAuth.escapeHTML(item.amount) + '</b></span>' +
                (item.paxLabel ? '<span class="account-fact"><small>Travellers</small><b>' + KridiyaAuth.escapeHTML(item.paxLabel) + '</b></span>' : "") +
                (item.paymentStatus ? '<span class="account-fact"><small>Payment</small><b>' + KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(item.paymentStatus)) + '</b></span>' : "") +
                (item.documentStatus ? '<span class="account-fact"><small>Documents</small><b>' + KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(item.documentStatus)) + '</b></span>' : "") +
                '<span class="account-detail"><small>Details</small><b>' + KridiyaAuth.escapeHTML(detailText) + '</b></span>' +
              '</div>' +
              ((requests.length || quotes.length || itemDocs.length || itemPayments.length) ? '<div class="account-item-alerts">' +
                (requests.length ? '<span>' + KridiyaAuth.escapeHTML(String(requests.length)) + ' request(s)</span>' : '') +
                (quotes.length ? '<span>' + KridiyaAuth.escapeHTML(String(quotes.length)) + ' quote(s)</span>' : '') +
                (itemDocs.length ? '<span>' + KridiyaAuth.escapeHTML(String(itemDocs.length)) + ' document(s)</span>' : '') +
                (itemPayments.length ? '<span>' + KridiyaAuth.escapeHTML(String(itemPayments.length)) + ' payment/refund update(s)</span>' : '') +
              '</div>' : '') +
              requestsHTML(requests) +
              quotesHTML(quotes) +
              (!item.isEnquiry ? customerDocsHTML(itemDocs) : '') +
              customerPaymentsHTML(itemPayments) +
              "</article>";
          }).join("");
          wireEnquiryExtras(listEl);
        } else {
          listEl.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 12h-4a3 3 0 0 1-6 0H5V5h14v10z"/></svg><p><b>No bookings linked yet.</b><br>Send an enquiry while signed in, or ask our team to attach an existing booking to this account.</p><div class="empty-actions"><a class="btn btn-primary" href="index.html">Start planning</a><a class="btn btn-outline" href="https://whatsapp.kridiyatravel.com" target="_blank" rel="noopener">WhatsApp support</a></div></div>';
        }
      } catch (err) {
        listEl.innerHTML = '<div class="form-banner error" role="alert">Could not load your enquiries yet: ' + KridiyaAuth.escapeHTML(errorMessage(err, "Please refresh and try again.")) + "</div>";
      }

      const pf = document.getElementById("profile-form");
      pf.name.value = user.name || "";
      pf.phone.value = user.phone || "";
      pf.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (!validateForm(pf)) return;
        const btn = pf.querySelector('button[type="submit"]');
        btn.disabled = true;
        try {
          const updated = await KridiyaAuth.updateProfile(user.email, { name: pf.name.value, phone: pf.phone.value });
          toast("Profile updated.");
          document.getElementById("acc-name").textContent = updated.name;
          document.getElementById("acc-avatar").textContent = updated.name.trim().charAt(0).toUpperCase();
          refreshHeaderName(updated);
        } catch (err) {
          toast(errorMessage(err, "Could not update your profile."));
        }
        btn.disabled = false;
      });

      const pwf = document.getElementById("password-form");
      initPwToggles(pwf);
      pwf.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (!validateForm(pwf)) return;
        const issue = KridiyaAuth.passwordIssue(pwf.newpass.value);
        if (issue) {
          setFieldError(pwf.newpass, issue);
          return;
        }
        banner(pwf, "");
        busy(pwf, true, "Updating...");
        try {
          await KridiyaAuth.changePassword(user.email, pwf.current.value, pwf.newpass.value);
          banner(pwf, "Password updated successfully.", "success");
          pwf.reset();
        } catch (err) {
          banner(pwf, errorMessage(err, "Could not update your password."), "error");
        }
        busy(pwf, false);
      });

      document.getElementById("logout-btn").addEventListener("click", async function () {
        await KridiyaAuth.logout();
        location.href = "index.html";
      });
    });
  }

  if (page === "corporate-account") {
    document.addEventListener("DOMContentLoaded", async function () {
      const gate = document.getElementById("corporate-account-gate");
      const app = document.getElementById("corporate-account-app");
      let user;
      try { user = await KridiyaAuth.currentUser(); } catch (_) {
        gate.textContent = "Your session could not be checked. Refresh to try again.";
        return;
      }
      if (!user) {
        location.replace("login.html?next=corporate-account.html");
        return;
      }
      window.KridiyaWorkspace.lifecycle(user);
      const logout = document.getElementById("corp-logout-btn");
      logout.addEventListener("click", async function () {
        window.KridiyaWorkspace.clear("Signing out…");
        try { await KridiyaAuth.logout(); } finally {
          location.replace("login.html?next=corporate-account.html");
        }
      });
      try {
        const companies = await KridiyaAuth.getMyCorporatePortal();
        if (window.KridiyaWorkspace.revoked()) return;
        if (!companies.length) {
          gate.innerHTML =
            '<div class="form-banner error" role="alert"><b>Corporate portal not activated yet.</b><br>Kridiya must approve your company and link your login before private company records appear here. You can still send a request below.</div>' +
            '<p><a class="btn btn-primary" href="booking.html">Send corporate request</a> <a class="btn btn-outline" href="https://wa.me/971509413873?text=Hello%20Kridiya%20Business%20Travel!%20Please%20activate%20my%20corporate%20portal%20access." target="_blank" rel="noopener">WhatsApp support</a></p>';
          return;
        }
        const requestedCompany = new URLSearchParams(location.search).get("company");
        const activeCompany = requestedCompany
          ? companies.find(function (company) { return company.corporate_account_id === requestedCompany; })
          : companies[0];
        if (!activeCompany) {
          gate.innerHTML = '<h2>Company access unavailable</h2><p>This company is not linked to your current login.</p><a class="btn btn-outline" href="corporate-account.html">Open an approved company</a>';
          return;
        }
        window.KridiyaWorkspace.configure(companies, activeCompany, user);
        const bookings = await KridiyaAuth.listMyCorporateBookings(activeCompany.corporate_account_id);
        const quotes = await KridiyaAuth.listMyCorporateQuotes(activeCompany.corporate_account_id).catch(corporateQuotesUnavailable);
        if (window.KridiyaWorkspace.revoked()) return;
        gate.hidden = true;
        app.hidden = false;
        renderCorporatePortal(companies, bookings, activeCompany, quotes);
        renderCorporateQuotes(quotes, activeCompany);
        loadCorporatePortalDetails(bookings, activeCompany);
        initCorporateHistory();
        initCorporatePortalTabs();
        const sidebarCompany = document.getElementById("corp-sidebar-company");
        const sidebarRole = document.getElementById("corp-sidebar-role");
        const portalStatus = document.getElementById("corp-portal-status");
        if (sidebarCompany) sidebarCompany.textContent = activeCompany.company_name || "Approved company";
        if (sidebarRole) sidebarRole.textContent = KridiyaAuth.statusLabel(activeCompany.member_role || "Member");
        if (portalStatus) portalStatus.textContent = "Active";
        initCorporatePortalRequest(activeCompany, function () {
          return Promise.all([
            KridiyaAuth.listMyCorporateBookings(activeCompany.corporate_account_id),
            KridiyaAuth.listMyCorporateQuotes(activeCompany.corporate_account_id).catch(corporateQuotesUnavailable)
          ]).then(function (results) {
            const freshBookings = results[0];
            const freshQuotes = results[1];
            renderCorporatePortal(companies, freshBookings, activeCompany, freshQuotes);
            renderCorporateQuotes(freshQuotes, activeCompany);
            loadCorporatePortalDetails(freshBookings, activeCompany);
          });
        });
        initCorporateDocumentRequest(activeCompany, bookings, function () {
          return Promise.all([
            KridiyaAuth.listMyCorporateBookings(activeCompany.corporate_account_id),
            KridiyaAuth.listMyCorporateQuotes(activeCompany.corporate_account_id).catch(corporateQuotesUnavailable)
          ]).then(function (results) {
            const freshBookings = results[0];
            const freshQuotes = results[1];
            renderCorporatePortal(companies, freshBookings, activeCompany, freshQuotes);
            renderCorporateQuotes(freshQuotes, activeCompany);
            loadCorporatePortalDetails(freshBookings, activeCompany);
            initCorporateDocumentRequest(activeCompany, freshBookings);
          });
        });
        initCorporateDeskCases(activeCompany);
        initCorporateTravellers(activeCompany);
        initCorporateFinanceEvidence(activeCompany, bookings);
        initCorporateBranches(activeCompany);
        initCorporatePolicies(activeCompany);
        initCorporateDisruptions(activeCompany);
        if (window.KridiyaCorporateReport && typeof window.KridiyaCorporateReport.mount === "function") {
          const reportClient = await KridiyaAuth.client();
          if (window.KridiyaWorkspace.revoked()) return;
          try {
            Promise.resolve(window.KridiyaCorporateReport.mount({
              companyId: activeCompany.corporate_account_id,
              client: reportClient,
              canFinance: activeCompany.can_view_finance === true
            })).catch(function () {
              if (!window.KridiyaWorkspace.revoked()) toast("The monthly report is unavailable. Your other workspace sections remain available.");
            });
          } catch (_) {
            toast("The monthly report is unavailable. Your other workspace sections remain available.");
          }
        }
      } catch (err) {
        if (window.KridiyaWorkspace.revoked()) return;
        gate.hidden = false;
        app.hidden = true;
        gate.innerHTML = '<div class="form-banner error" role="alert">Could not load corporate portal yet: ' + KridiyaAuth.escapeHTML(errorMessage(err, "Please refresh and try again.")) + "</div>";
      }
    });
  }

  function initCorporateDeskCases(activeCompany) {
    const form = document.getElementById("corp-desk-case-form");
    const list = document.getElementById("corp-desk-case-list");
    if (!form || !list || form.dataset.ready === "true") return;
    form.dataset.ready = "true";
    syncCorporateBookingSelectors(corporateHistory ? corporateHistory.bookings : []);
    if (!activeCompany.can_request) form.querySelector('button[type="submit"]').disabled=true;
    async function load() {
      const cases = await KridiyaAuth.listMyCorporateDeskCases(activeCompany.corporate_account_id);
      const details=await Promise.all(cases.map(function(c){return KridiyaAuth.getCorporateDeskCase(c.id);}));
      list.innerHTML = details.length ? details.map(function (detail) {
        const item=detail.case, closed=/^(resolved|closed)$/.test(item.status), escape=KridiyaAuth.escapeHTML;
        return '<article class="portal-record-card"><div><span>'+escape(item.category)+' / '+escape(item.status)+'</span><b>'+escape(item.subject)+'</b><p>'+escape(item.description)+'</p>'+
          (detail.messages||[]).map(function(m){return '<div class="portal-panel"><b>'+escape(m.author_kind==='staff'?'Kridiya reply':'Company reply')+'</b><p>'+escape(m.body)+'</p><small>'+escape(m.created_at)+' · Captured locally; no external message sent.</small></div>';}).join('')+
          (activeCompany.can_request ? '<form class="corporate-case-reply" data-id="'+escape(item.id)+'" data-version="'+escape(String(item.version))+'" data-reopen="'+closed+'"><label>Company reply<textarea name="body" minlength="10" maxlength="4000" required></textarea></label><button class="btn btn-outline" type="submit">'+(closed?'Reopen case':'Reply to case')+'</button><p role="status"></p></form>' : '')+'</div></article>';
      }).join('') : '<div class="portal-empty">No tracked Corporate Desk cases yet.</div>';
    }
    document.getElementById("corp-desk-refresh").addEventListener("click",function(){load().catch(function(){toast("Could not refresh cases.");});});
    window.addEventListener("corporate-case-created",function(){load().catch(function(){});});
    list.addEventListener("submit",async function(e){const reply=e.target.closest('.corporate-case-reply');if(!reply)return;e.preventDefault();const button=reply.querySelector('button'),message=reply.querySelector('[role="status"]');button.disabled=true;try{await KridiyaAuth.replyCorporateDeskCase(reply.dataset.id,Number(reply.dataset.version),reply.body.value,reply.dataset.reopen==='true');await load();toast("Company reply recorded locally.");}catch(err){message.textContent=errorMessage(err,"Could not save reply. Your text is retained.");button.disabled=false;}});
    load().catch(function (err) { list.innerHTML = '<div class="form-banner error">' + KridiyaAuth.escapeHTML(errorMessage(err,"Could not load Corporate Desk cases.")) + '</div>'; });
    form.addEventListener("submit", async function (e) {
      e.preventDefault(); if (!validateForm(form)) return; banner(form, ""); busy(form, true, "Opening...");
      try { await KridiyaAuth.createMyCorporateDeskCase({ corporateAccountId: activeCompany.corporate_account_id, category: form.category.value, urgency: form.urgency.value, subject: form.subject.value.trim(), description: form.description.value.trim(), bookingId: form.booking_id.value }); form.reset(); await load(); toast("Corporate Desk case recorded. Awaiting staff assignment; no message sent."); }
      catch (err) { banner(form, errorMessage(err,"Could not open the case."), "error"); }
      busy(form, false);
    });
  }

  function initCorporateTravellers(activeCompany) {
    const form=document.getElementById("corp-traveller-form"),list=document.getElementById("corp-traveller-list"); if(!form||!list)return; let travellers=[];
    async function load(){travellers=await KridiyaAuth.listMyCorporateTravellers(activeCompany.corporate_account_id);list.innerHTML=travellers.length?travellers.map(function(t){return '<article class="portal-record-card"><div><b>'+KridiyaAuth.escapeHTML(t.full_name)+'</b><p>'+KridiyaAuth.escapeHTML([t.nationality,t.passport_number,t.passport_expiry?"Expires "+t.passport_expiry:""].filter(Boolean).join(" / "))+'</p></div><div><button class="btn btn-outline btn-sm js-edit-traveller" data-id="'+KridiyaAuth.escapeHTML(t.id)+'" type="button">Edit</button> <button class="btn btn-outline btn-sm js-archive-traveller" data-id="'+KridiyaAuth.escapeHTML(t.id)+'" type="button">Archive</button></div></article>';}).join(''):'<div class="portal-empty">No company travellers saved yet.</div>';}
    load().catch(function(e){list.innerHTML='<div class="form-banner error">'+KridiyaAuth.escapeHTML(errorMessage(e,"Could not load travellers."))+'</div>';});
    form.addEventListener("submit",async function(e){e.preventDefault();if(!validateForm(form))return;banner(form,"");busy(form,true,"Saving...");try{await KridiyaAuth.saveMyCorporateTraveller({corporateAccountId:activeCompany.corporate_account_id,id:form.traveller_id.value,expectedUpdatedAt:form.expected_updated_at.value,fullName:form.full_name.value.trim(),dateOfBirth:form.date_of_birth.value,nationality:form.nationality.value.trim(),passportNumber:form.passport_number.value.trim(),passportExpiry:form.passport_expiry.value,notes:form.notes.value.trim()});form.reset();await load();toast("Company traveller saved.");}catch(err){banner(form,errorMessage(err,"Could not save traveller."),"error");}busy(form,false);});
    list.addEventListener("click",async function(e){const edit=e.target.closest(".js-edit-traveller"),archive=e.target.closest(".js-archive-traveller"),id=(edit||archive)?.dataset.id,t=travellers.find(function(x){return x.id===id;});if(!t)return;if(edit){form.traveller_id.value=t.id;form.expected_updated_at.value=t.updated_at;form.full_name.value=t.full_name||"";form.date_of_birth.value=t.date_of_birth||"";form.nationality.value=t.nationality||"";form.passport_number.value=t.passport_number||"";form.passport_expiry.value=t.passport_expiry||"";form.notes.value=t.notes||"";form.scrollIntoView({behavior:"smooth"});return;}if(!await window.KridiyaWorkspace.dialog({title:"Archive traveller?",description:"This traveller will leave your active company directory. Existing booking records are retained.",confirm:"Archive traveller"}))return;try{await KridiyaAuth.archiveMyCorporateTraveller(activeCompany.corporate_account_id,t.id,t.updated_at);await load();toast("Company traveller archived.");}catch(err){toast(errorMessage(err,"Could not archive traveller."));}});
    const fileInput=document.getElementById("corp-traveller-csv"),importButton=document.getElementById("corp-traveller-import"),templateButton=document.getElementById("corp-traveller-template");
    function csvRows(text){const rows=[];let row=[],cell="",quoted=false;for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){row.push(cell);cell="";}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(function(v){return v.trim()!=="";}))rows.push(row);row=[];cell="";}else cell+=ch;}row.push(cell);if(row.some(function(v){return v.trim()!=="";}))rows.push(row);return rows;}
    templateButton.addEventListener("click",function(){const content="full_name,date_of_birth,nationality,passport_number,passport_expiry,notes\nSample Traveller,1990-01-31,Indian,A1234567,2030-12-31,Optional company note\n";const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="kridiya-traveller-import-template.csv";a.click();URL.revokeObjectURL(url);});
    importButton.addEventListener("click",async function(){if(!fileInput.files||!fileInput.files[0]){toast("Choose a CSV file first.");return;}importButton.disabled=true;try{const matrix=csvRows(await fileInput.files[0].text());if(matrix.length<2)throw new Error("CSV must include headers and at least one traveller row.");const expected=["full_name","date_of_birth","nationality","passport_number","passport_expiry","notes"],headers=matrix[0].map(function(x){return x.trim().toLowerCase();});if(expected.join("|")!==headers.join("|"))throw new Error("CSV headers must exactly match the Kridiya template.");const rows=matrix.slice(1).map(function(values){const item={};expected.forEach(function(key,index){item[key]=(values[index]||"").trim();});return item;});if(rows.length>100)throw new Error("Import is limited to 100 travellers at a time.");const result=await KridiyaAuth.importMyCorporateTravellers(activeCompany.corporate_account_id,rows);fileInput.value="";await load();toast(String(result.imported_count)+" travellers imported successfully.");}catch(err){toast(errorMessage(err,"Could not import traveller CSV."));}importButton.disabled=false;});
  }

  function initCorporateFinanceEvidence(activeCompany,bookings) {
    const form=document.getElementById("corp-finance-evidence-form"),list=document.getElementById("corp-finance-evidence-list");
    if(!form||!list)return;
    if(!activeCompany.can_view_finance){form.hidden=true;list.innerHTML='<div class="portal-empty">Finance access is required to view payment requests or submit evidence.</div>';return;}
    let requests=[];
    function selectedRequest(){return requests.find(function(item){return item.id===form.payment_request_id.value;})||null;}
    function syncRequest(){const request=selectedRequest(),needsAmount=["payment_proof","deposit_reference"].includes(form.evidence_type.value);form.currency.value=request?request.currency:"";form.claimed_amount.value=request&&needsAmount?Math.max(0,Number(request.amount)-Number(request.verified_amount||0)).toFixed(2):"";}
    function syncEvidence(){const type=form.evidence_type.value,fileRequired=type==="payment_proof",amountRequired=type==="payment_proof"||type==="deposit_reference";form.file.required=fileRequired;form.claimed_amount.required=amountRequired;form.reference.required=type==="deposit_reference";form.customer_declaration.required=type==="customer_declaration";if(!amountRequired)form.claimed_amount.value="";else if(!form.claimed_amount.value)syncRequest();}
    async function load(){requests=await KridiyaAuth.listMyCorporatePaymentRequests(activeCompany.corporate_account_id);const open=requests.filter(function(item){return item.status==="open"||item.status==="partially_paid";});form.payment_request_id.innerHTML='<option value="">Choose request...</option>'+open.map(function(item){return '<option value="'+KridiyaAuth.escapeHTML(item.id)+'">'+KridiyaAuth.escapeHTML((item.booking_reference||"Booking")+" · quote v"+item.quote_version+" · "+item.currency+" "+Number(item.amount).toFixed(2))+'</option>';}).join('');list.innerHTML=requests.length?requests.map(function(item){const evidence=Array.isArray(item.evidence)?item.evidence:[];const reconciliation=item.status==="reconciliation_pending"?'<p>Existing verified funds are awaiting explicit allocation by Kridiya. No additional full payment is being requested.</p>':'';return '<article class="portal-record-card"><div><b>'+KridiyaAuth.escapeHTML((item.booking_reference||"Booking")+" · quote v"+item.quote_version+" · "+item.currency+" "+Number(item.amount).toFixed(2))+'</b><p>Verified and allocated '+KridiyaAuth.escapeHTML(item.currency+" "+Number(item.verified_amount||0).toFixed(2))+'. Evidence alone does not mark this paid.</p>'+reconciliation+evidence.map(function(x){return '<p>'+KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(x.evidence_type)+([x.reference,x.file_name].filter(Boolean).length?" · "+[x.reference,x.file_name].filter(Boolean).join(" / "):"")+" · "+KridiyaAuth.statusLabel(x.status))+'</p>';}).join('')+'</div><span class="status-chip">'+KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(item.status))+'</span></article>';}).join(''):'<div class="portal-empty">No payment request has been issued for an approved quote.</div>';syncRequest();}
    form.payment_request_id.addEventListener("change",syncRequest);form.evidence_type.addEventListener("change",syncEvidence);syncEvidence();
    load().catch(function(e){list.innerHTML='<div class="form-banner error">'+KridiyaAuth.escapeHTML(errorMessage(e,"Could not load payment requests."))+'</div>';});
    form.addEventListener("submit",async function(e){e.preventDefault();if(!validateForm(form))return;const request=selectedRequest(),type=form.evidence_type.value,file=form.file.files[0]||null;if(!request){banner(form,"Choose an active payment request.","error");return;}if(file&&(file.size>10485760||!["application/pdf","image/jpeg","image/png"].includes(file.type))){banner(form,"Choose a PDF, JPG or PNG no larger than 10 MB.","error");return;}if(type==="payment_proof"&&!file){banner(form,"A payment proof file is required.","error");return;}banner(form,"");busy(form,true,"Submitting...");try{await KridiyaAuth.submitMyCorporatePaymentEvidence({paymentRequestId:request.id,bookingId:request.booking_id,evidenceType:type,reference:form.reference.value.trim(),customerDeclaration:form.customer_declaration.value.trim(),claimedAmount:form.claimed_amount.value?Number(form.claimed_amount.value):null,currency:form.currency.value,file:file});form.reset();syncEvidence();await load();toast("Evidence submitted. Payment remains unverified until Kridiya matches received funds.");}catch(err){banner(form,errorMessage(err,"Could not submit evidence."),"error");}busy(form,false);});
  }
  async function initCorporateBranches(activeCompany){const target=document.getElementById("corp-branch-list");if(!target)return;try{const rows=await KridiyaAuth.listMyCorporateBranches(activeCompany.corporate_account_id);target.innerHTML=rows.length?rows.map(function(b){return '<article class="portal-record-card"><div><b>'+KridiyaAuth.escapeHTML(b.branch_name)+'</b><p>'+KridiyaAuth.escapeHTML([b.branch_code,b.city,b.country,b.address,b.phone,b.billing_email].filter(Boolean).join(" / "))+'</p></div><span class="status-chip">'+KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(b.status))+'</span></article>';}).join(''):'<div class="portal-empty">No branches have been configured for this company.</div>';}catch(err){target.innerHTML='<div class="form-banner error">'+KridiyaAuth.escapeHTML(errorMessage(err,"Could not load branches."))+'</div>';}}
  async function initCorporatePolicies(activeCompany){const target=document.getElementById("corp-policy-list");if(!target)return;try{const rows=await KridiyaAuth.listMyCorporateTravelPolicies(activeCompany.corporate_account_id);target.innerHTML=rows.length?rows.map(function(p){return '<article class="portal-record-card"><div><b>'+KridiyaAuth.escapeHTML(p.policy_name)+'</b><p>'+KridiyaAuth.escapeHTML([p.trip_budget_limit!=null?"Trip budget "+p.currency+" "+p.trip_budget_limit:"",p.approval_threshold!=null?"Approval above "+p.currency+" "+p.approval_threshold:"","Book "+p.advance_booking_days+" days ahead","Max cabin "+KridiyaAuth.statusLabel(p.max_cabin),p.max_hotel_stars?"Max hotel "+p.max_hotel_stars+" stars":"",p.requires_lpo?"LPO required":"",p.requires_second_approval?"Two approvals required":""].filter(Boolean).join(" / "))+'</p></div></article>';}).join(''):'<div class="portal-empty">No active travel policy has been published.</div>';}catch(err){target.innerHTML='<div class="form-banner error">'+KridiyaAuth.escapeHTML(errorMessage(err,"Could not load travel policy."))+'</div>';}}
  async function initCorporateDisruptions(activeCompany){const target=document.getElementById("corp-disruption-list");if(!target)return;try{const rows=await KridiyaAuth.listMyCorporateTravelDisruptions(activeCompany.corporate_account_id);target.innerHTML=rows.length?rows.map(function(d){return '<article class="portal-record-card"><div><b>'+KridiyaAuth.escapeHTML(d.title)+' — '+KridiyaAuth.escapeHTML(d.booking_reference)+'</b><p>'+KridiyaAuth.escapeHTML([KridiyaAuth.statusLabel(d.severity),KridiyaAuth.statusLabel(d.status),d.next_update_at?"Next update "+new Date(d.next_update_at).toLocaleString("en-GB"):""].filter(Boolean).join(" / "))+'</p>'+(d.updates||[]).map(function(u){return '<p>'+KridiyaAuth.escapeHTML(u.message)+'</p>';}).join('')+'</div><span class="status-chip">'+KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(d.impact_status))+'</span></article>';}).join(''):'<div class="portal-empty">No active disruption affects this company’s bookings.</div>';}catch(err){target.innerHTML='<div class="form-banner error">'+KridiyaAuth.escapeHTML(errorMessage(err,"Could not load disruption updates."))+'</div>';}}

  function syncCorporateBookingSelectors(bookings) {
    const form = document.getElementById("corp-desk-case-form");
    if (!form || !form.booking_id) return;
    const selected = form.booking_id.value;
    form.booking_id.innerHTML = '<option value="">No linked booking</option>' + bookings.map(function (booking) {
      return '<option value="' + KridiyaAuth.escapeHTML(booking.id) + '">' + KridiyaAuth.escapeHTML((booking.booking_reference || "Booking") + ' - ' + (booking.title || "Travel request")) + '</option>';
    }).join("");
    if (bookings.some(function (booking) { return booking.id === selected; })) form.booking_id.value = selected;
  }

  function renderCorporateHistoryControls() {
    if (!corporateHistory || window.KridiyaWorkspace.revoked()) return;
    ["bookings", "quotes"].forEach(function (kind) {
      const rows = corporateHistory[kind];
      const unavailable = !!rows.loadFailed;
      document.querySelectorAll('[data-corporate-history-status="' + kind + '"]').forEach(function (target) {
        target.textContent = unavailable ? "History unavailable. Refresh to try again." : rows.length + " " + kind + " loaded. " + (rows.hasMore ? "Earlier records are available. Search and summaries cover loaded records only." : "All currently available records are loaded.");
      });
      document.querySelectorAll('[data-corporate-load-more="' + kind + '"]').forEach(function (button) {
        button.hidden = unavailable || !rows.hasMore;
        button.disabled = !!corporateHistory.loading;
        button.textContent = corporateHistory.loading === kind ? "Loading…" : "Load earlier " + kind;
      });
    });
  }

  function initCorporateHistory() {
    const app = document.getElementById("corporate-account-app");
    if (!app || app.dataset.historyReady === "true") return;
    app.dataset.historyReady = "true";
    app.addEventListener("click", async function (event) {
      const retry = event.target.closest("[data-corporate-details-retry]");
      if (retry && corporateHistory) {
        retry.disabled = true;
        await loadCorporatePortalDetails(corporateHistory.bookings, corporateHistory.activeCompany);
        if (retry.isConnected) retry.disabled = false;
        return;
      }
      const button = event.target.closest("[data-corporate-load-more]");
      if (!button || !corporateHistory || corporateHistory.loading || window.KridiyaWorkspace.revoked()) return;
      const kind = button.dataset.corporateLoadMore;
      if (kind !== "bookings" && kind !== "quotes") return;
      const state = corporateHistory;
      let renderedState = null;
      const rows = state[kind];
      if (!rows.hasMore || !rows.nextCursor) return;
      state.loading = kind;
      document.querySelectorAll("[data-corporate-history-error]").forEach(function (target) { target.textContent = ""; });
      renderCorporateHistoryControls();
      try {
        const fetchPage = kind === "bookings" ? KridiyaAuth.listMyCorporateBookings : KridiyaAuth.listMyCorporateQuotes;
        const next = await fetchPage(state.activeCompany.corporate_account_id, rows.nextCursor);
        if (window.KridiyaWorkspace.revoked() || state !== corporateHistory) return;
        if (next.hasMore && (next.length === 0 || (next.nextCursor.id === rows.nextCursor.id && next.nextCursor.created_at === rows.nextCursor.created_at))) throw new Error("History cursor did not advance. Refresh to reload the latest records.");
        const seen = new Set(rows.map(function (row) { return row.id; }));
        const merged = rows.concat(next.filter(function (row) { return !seen.has(row.id); }));
        merged.hasMore = next.hasMore;
        merged.nextCursor = next.nextCursor;
        const bookings = kind === "bookings" ? merged : state.bookings;
        const quotes = kind === "quotes" ? merged : state.quotes;
        renderCorporatePortal(state.companies, bookings, state.activeCompany, quotes, true);
        renderedState = corporateHistory;
        renderedState.loading = kind;
        renderCorporateQuotes(quotes, state.activeCompany);
        window.KridiyaWorkspace.recordsUpdated();
        if (kind === "bookings") {
          initCorporateDocumentRequest(state.activeCompany, bookings);
          syncCorporateBookingSelectors(bookings);
          await loadCorporatePortalDetails(bookings, state.activeCompany);
        }
      } catch (error) {
        if (window.KridiyaWorkspace.revoked() || state !== corporateHistory) return;
        document.querySelectorAll('[data-corporate-history-error="' + kind + '"]').forEach(function (target) {
          target.textContent = "Earlier records could not be loaded. Your current records are retained. Try again. " + errorMessage(error, "");
        });
      } finally {
        if (state === corporateHistory) state.loading = null;
        if (renderedState === corporateHistory) renderedState.loading = null;
        renderCorporateHistoryControls();
      }
    });
  }

  function renderCorporatePortal(companies, bookings, activeCompany, quotes, preserveDetails) {
    const companyList = document.getElementById("corp-company-list");
    const bookingList = document.getElementById("corp-booking-list");
    const visibleQuotes = Array.isArray(quotes) ? quotes : [];
    const openCount = bookings.filter(function (booking) {
      return !/completed|cancelled|refunded/i.test(String(booking.status || ""));
    }).length;
    const paymentHandoffCount = bookings.filter(function (booking) {
      return isCorporatePaymentHandoff(booking);
    }).length;
    const supplierPendingCount = bookings.filter(function (booking) {
      return /awaiting_supplier_confirmation|supplier_commitment_requested|supplier_commitment_failed|supplier_offer_expired|revised_quote_required/.test(String(booking.supplier_fulfilment_status || ""));
    }).length;
    const sentQuotes = visibleQuotes.filter(function (quote) {
      return String(quote.status || "") === "sent";
    }).length;
    if (window.KridiyaWorkspace.revoked()) return;
    if (!preserveDetails) {
      corporateDetailCache = new Map();
      corporateLoadedDetailIds = new Set();
    }
    corporateHistory = { companies: companies, bookings: bookings, quotes: visibleQuotes, activeCompany: activeCompany, loading: null };
    renderCorporateHistoryControls();
    document.getElementById("corp-visible-items").textContent = String(bookings.length);
    document.getElementById("corp-quote-count").textContent = visibleQuotes.loadFailed ? "—" : String(sentQuotes);
    document.getElementById("corp-company-name").textContent = activeCompany.company_name || "Approved company";
    document.getElementById("corp-member-role").textContent = KridiyaAuth.statusLabel(activeCompany.member_role || "Member");
    const openEl = document.getElementById("corp-open-count");
    if (openEl) openEl.textContent = String(openCount + sentQuotes);
    const financeNote = document.getElementById("corp-finance-note");
    if (financeNote) {
      financeNote.textContent = activeCompany.can_view_finance
        ? "You can view the payment records available to your company role."
        : "Your role does not include finance access. Contact the corporate desk to request a review of your access.";
    }
    const commandStatus = document.getElementById("corp-command-status");
    const commandCopy = document.getElementById("corp-command-copy");
    const recentTitle = document.getElementById("corp-recent-title");
    const recentCopy = document.getElementById("corp-recent-copy");
    if (commandStatus && commandCopy) {
      if (sentQuotes) {
        commandStatus.textContent = sentQuotes + " quote option(s) need review";
        commandCopy.textContent = activeCompany.can_approve_quotes
          ? "Open Quotes to accept or decline options released by Kridiya."
          : "Quotes are visible, but this login does not have approval permission.";
      } else if (paymentHandoffCount) {
        commandStatus.textContent = paymentHandoffCount + " payment step" + (paymentHandoffCount === 1 ? "" : "s") + " waiting";
        commandCopy.textContent = "Your quote is accepted. Bookings are prepaid: Kridiya verifies funds before supplier confirmation. An LPO does not replace payment.";
      } else if (supplierPendingCount) {
        commandStatus.textContent = supplierPendingCount + " paid booking" + (supplierPendingCount === 1 ? "" : "s") + " awaiting supplier action";
        commandCopy.textContent = "Customer payment is verified. Kridiya is handling supplier availability and confirmation separately.";
      } else if (openCount) {
        commandStatus.textContent = openCount + " active booking record(s)";
        commandCopy.textContent = "Track progress across quote, payment, documents, and monthly reporting.";
      } else {
        commandStatus.textContent = "Workspace ready";
        commandCopy.textContent = "Send your next travel request to the corporate desk.";
      }
    }
    if (recentTitle && recentCopy) {
      const latest = bookings.slice().sort(function (a, b) {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      })[0];
      if (latest) {
        recentTitle.textContent = latest.booking_reference || latest.title || "Latest corporate booking";
        recentCopy.textContent = (latest.title || KridiyaAuth.statusLabel(latest.service_type || "Corporate")) + " / " + KridiyaAuth.statusLabel(latest.supplier_fulfilment_status || latest.status || "received");
      } else {
        recentTitle.textContent = "No company bookings yet";
        recentCopy.textContent = "Send your first travel request for this company to the corporate desk.";
      }
    }
    renderCorporateAttentionQueue(bookings, visibleQuotes, activeCompany);
    renderCorporateActivityRail(bookings, visibleQuotes);
    const next = document.getElementById("corp-next-action");
    if (next) {
      next.innerHTML = paymentHandoffCount
        ? '<b>' + KridiyaAuth.escapeHTML(String(paymentHandoffCount)) + ' payment handoff' + (paymentHandoffCount === 1 ? "" : "s") + '</b><p>Open Bookings or Finance for the accepted quote status. Verified funds are required before supplier confirmation; an LPO does not replace payment.</p>'
        : supplierPendingCount
        ? '<b>' + KridiyaAuth.escapeHTML(String(supplierPendingCount)) + ' paid booking' + (supplierPendingCount === 1 ? "" : "s") + ' awaiting supplier confirmation</b><p>No additional customer payment is implied. Kridiya is checking or confirming the supplier before releasing travel documents.</p>'
        : openCount
        ? '<b>' + KridiyaAuth.escapeHTML(String(openCount)) + ' active item(s)</b><p>Review booking status, documents, payment status, and any pending details requested by Kridiya.</p>'
        : '<b>Ready for requests</b><p>Send the trip details to the corporate desk. Your advisor will check the options and explain the next steps.</p>';
    }
    document.getElementById("corp-access-copy").textContent = window.KridiyaWorkspace.describe(document.body.dataset.portalSection || "overview");

    companyList.innerHTML = [activeCompany].map(function (company) {
      const chips = [
        company.can_request ? "Can request" : "Request locked",
        company.can_approve_quotes ? "Can approve quotes" : "Quote approval not enabled for your role",
        company.can_view_finance ? "Finance visible" : "Finance hidden",
        company.lpo_required ? "LPO required" : "No LPO requirement recorded"
      ];
      return '<div class="corporate-company-card">' +
        '<b>' + KridiyaAuth.escapeHTML(company.company_name || "Company") + '</b>' +
        '<p>' + KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(company.member_role || "member")) + ' access - ' + KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(company.status || "active")) + '</p>' +
        '<div>' + chips.map(function (chip) { return '<span>' + KridiyaAuth.escapeHTML(chip) + '</span>'; }).join("") + '</div>' +
      '</div>';
    }).join("");

    if (!bookings.length) {
      bookingList.innerHTML = '<div class="empty-state"><p>No corporate bookings are visible yet. Submit your first portal request or ask Kridiya to link existing company bookings.</p></div>';
      return;
    }

    bookingList.innerHTML = '<div class="booking-command-head">' +
      '<div><span>Company booking control</span><b>' + KridiyaAuth.escapeHTML(String(bookings.length)) + ' visible record(s)</b></div>' +
      '<button class="btn btn-outline btn-sm" type="button" onclick="window.KridiyaOpenCorporateTab && window.KridiyaOpenCorporateTab(\'request\')">Create another request</button>' +
    '</div>' + bookings.map(function (booking) {
      const amount = booking.amount != null ? KridiyaAuth.escapeHTML(String(booking.currency || "AED")) + ' ' + KridiyaAuth.escapeHTML(String(booking.amount)) : activeCompany.can_view_finance ? "Amount not recorded" : "Finance restricted";
      const service = KridiyaAuth.statusLabel(booking.service_type || "Corporate");
      const route = booking.route_or_destination || "Route/details being coordinated";
      const dates = [booking.travel_start, booking.travel_end].filter(Boolean).map(function (date) {
        return new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      }).join(" - ") || "Dates pending";
      const payment = KridiyaAuth.statusLabel(booking.payment_status || "not_requested");
      const docs = KridiyaAuth.statusLabel(booking.document_status || "not_started");
      const supplierStatus = String(booking.supplier_fulfilment_status || "");
      const needsPaymentHandoff = isCorporatePaymentHandoff(booking);
      const stage = booking.document_status && booking.document_status !== "not_started"
        ? "Documents"
        : supplierStatus === "supplier_confirmed"
          ? "Confirmed"
        : /awaiting_supplier_confirmation|supplier_commitment_requested|supplier_commitment_failed|supplier_offer_expired|revised_quote_required/.test(supplierStatus)
          ? "Supplier"
        : /confirmed|ticketed|completed/i.test(String(booking.status || ""))
            ? "Confirmed"
          : needsPaymentHandoff || (booking.payment_status && booking.payment_status !== "not_requested")
            ? "Payment"
            : "In progress";
      const progressClass = stage === "Documents" || stage === "Confirmed" ? "is-docs" : stage === "Payment" || stage === "Supplier" ? "is-payment" : "is-request";
      const nextAction = corporateBookingNextAction(booking, stage);
      return '<article class="corporate-booking-card">' +
        '<div class="corporate-booking-head">' +
          '<div><small>Reference</small><b>' + KridiyaAuth.escapeHTML(booking.booking_reference || "Corporate request") + '</b></div>' +
          '<span>' + KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(booking.status || "received")) + '</span>' +
        '</div>' +
        '<div class="corporate-booking-main">' +
          '<div><h3>' + KridiyaAuth.escapeHTML(booking.title || KridiyaAuth.statusLabel(booking.service_type)) + '</h3><p>' + KridiyaAuth.escapeHTML(route) + '</p></div>' +
          '<strong>' + KridiyaAuth.escapeHTML(stage) + '</strong>' +
        '</div>' +
        '<details class="booking-detail-disclosure"><summary>Booking progress</summary><div class="corporate-booking-progress ' + progressClass + '" aria-label="Booking progress">' +
          '<span class="is-done">Request</span>' +
          '<span class="' + (/Payment|Supplier|Documents|Confirmed/.test(stage) ? "is-done" : "is-active") + '">Quote</span>' +
          '<span class="' + (/Supplier|Documents|Confirmed/.test(stage) ? "is-done" : /Payment/.test(stage) ? "is-active" : "") + '">Payment</span>' +
          '<span class="' + (/Documents|Confirmed/.test(stage) ? "is-done" : /Supplier/.test(stage) ? "is-active" : "") + '">Supplier</span>' +
          '<span class="' + (/Documents|Confirmed/.test(stage) ? "is-active" : "") + '">Documents</span>' +
        '</div>' +
        corporateBookingTimelineHTML(booking, stage) +
        '</details>' +
        '<div class="corporate-next-action">' +
          '<span>' + KridiyaAuth.escapeHTML(nextAction.label) + '</span>' +
          '<b>' + KridiyaAuth.escapeHTML(nextAction.title) + '</b>' +
          '<p>' + KridiyaAuth.escapeHTML(nextAction.copy) + '</p>' +
        '</div>' +
        '<div class="booking-detail-grid">' +
          '<div><span>Service</span><b>' + KridiyaAuth.escapeHTML(service) + '</b></div>' +
          '<div><span>Travel window</span><b>' + KridiyaAuth.escapeHTML(dates) + '</b></div>' +
          '<div><span>Payment</span><b>' + KridiyaAuth.escapeHTML(payment) + '</b></div>' +
          '<div><span>Documents</span><b>' + KridiyaAuth.escapeHTML(docs) + '</b></div>' +
        '</div>' +
        (needsPaymentHandoff ? '<div class="payment-handoff-panel">' +
          '<div><span>Payment / LPO handoff</span><b>' + KridiyaAuth.escapeHTML(paymentClearanceTitle(booking)) + '</b><p>' + KridiyaAuth.escapeHTML(paymentClearanceCopy(booking)) + '</p></div>' +
          '<div class="payment-handoff-actions">' +
            '<button class="btn btn-outline btn-sm" type="button" onclick="window.KridiyaOpenCorporateTab && window.KridiyaOpenCorporateTab(\'finance\')">Finance status</button>' +
            '<a class="btn btn-primary btn-sm" href="https://wa.me/971509413873?text=Hello%20Kridiya%20Business%20Travel%2C%20I%20want%20to%20confirm%20payment%20or%20LPO%20for%20' + encodeURIComponent(booking.booking_reference || booking.title || "my corporate booking") + '." target="_blank" rel="noopener">Send proof / LPO</a>' +
          '</div>' +
          paymentClearanceTimelineHTML(booking) +
        '</div>' : '') +
        '<footer><small>Use this booking reference when contacting the corporate desk.</small><b>' + amount + '</b></footer>' +
      '</article>';
    }).join("");
  }

  function corporateBookingNextAction(booking, stage) {
    if (String(booking.status || "").toLowerCase() === "completed") return { label: "Travel completed", title: "This booking is complete.", copy: "Released documents remain available to your company. Contact the desk if you need help with this trip." };
    if (isCorporatePaymentHandoff(booking)) {
      return {
        label: "Next company action",
        title: paymentClearanceTitle(booking),
        copy: paymentClearanceCopy(booking)
      };
    }
    const supplierStatus = String(booking && booking.supplier_fulfilment_status || "");
    if (supplierStatus === "awaiting_supplier_confirmation") return { label: "Kridiya supplier action", title: "Paid — awaiting supplier confirmation.", copy: "Your verified payment is complete. Kridiya is checking availability and has not issued travel documents yet." };
    if (supplierStatus === "supplier_commitment_requested") return { label: "Kridiya supplier action", title: "Supplier commitment requested.", copy: "Your company does not owe another payment. Kridiya is waiting for the supplier’s exact confirmation." };
    if (supplierStatus === "revised_quote_required") return { label: "Commercial change", title: "Supplier terms changed; a revised quote is required.", copy: "Existing verified funds are preserved. Kridiya will issue a revised quote and explicitly reconcile them after approval." };
    if (/supplier_commitment_failed|supplier_offer_expired/.test(supplierStatus)) return { label: "Kridiya supplier action", title: "The supplier option could not be confirmed.", copy: "Your verified payment remains recorded while Kridiya checks a fresh option." };
    if (/Documents|Confirmed/.test(stage)) {
      return {
        label: "Current handover",
        title: "Check your booking status and released documents.",
        copy: "Open Documents to view the files released to your company."
      };
    }
    if (/confirmed|ticketed|completed/i.test(String(booking.status || ""))) {
      return {
        label: "Current handover",
        title: "Booking is moving through confirmation.",
        copy: "Kridiya is checking confirmation with the travel provider and preparing your documents."
      };
    }
    return {
      label: "Current desk action",
      title: "Kridiya is reviewing the request.",
      copy: "Your requirement is in the corporate desk. Quote options or follow-up questions will appear here."
    };
  }

  function corporateBookingTimelineHTML(booking, stage) {
    const paymentLevel = paymentClearanceLevel(booking);
    const docsStarted = booking.document_status && !/not_started/i.test(String(booking.document_status));
    const confirmed = /confirmed|ticketed|completed/i.test(String(booking.status || ""));
    const supplierConfirmed = String(booking.supplier_fulfilment_status || "") === "supplier_confirmed" || confirmed;
    const steps = [
      ["Request received", true, "The corporate desk has received your request."],
      ["Quote prepared", /Payment|Supplier|Documents|Confirmed/.test(stage), "Your advisor has prepared options for your review."],
      ["Payment verified", paymentLevel >= 4, "Verified customer funds cover the current approved quote."],
      ["Supplier confirmed", supplierConfirmed, "Availability and exact supplier terms are confirmed separately from payment."],
      ["Travel documents released", docsStarted, "Tickets and vouchers appear after booking confirmation; receipts are shown with payment records."]
    ];
    return '<ol class="corporate-booking-timeline" aria-label="Corporate booking status timeline">' + steps.map(function (step, index) {
      const done = !!step[1];
      const current = !done && !steps.slice(0, index).some(function (prior) { return !prior[1]; });
      return '<li class="' + (done ? "is-done" : current ? "is-current" : "") + '"><span>' + KridiyaAuth.escapeHTML(String(index + 1)) + '</span><div><b>' + KridiyaAuth.escapeHTML(step[0]) + '</b><small>' + KridiyaAuth.escapeHTML(step[2]) + '</small></div></li>';
    }).join("") + '</ol>';
  }

  function isCorporatePaymentHandoff(booking) {
    const status = String(booking && booking.status || "").toLowerCase();
    const payment = String(booking && booking.payment_status || "").toLowerCase();
    if (/^(paid|supplier_payment_pending|supplier_paid)$/.test(payment)) return false;
    return /payment_pending|awaiting_payment|quote_accepted/.test(status)
      || (payment !== "not_requested" && /pending|request_sent|proof_received|partially_paid/.test(payment) && !/supplier/.test(payment));
  }

  function paymentClearanceLevel(booking) {
    const status = String(booking && booking.status || "").toLowerCase();
    const payment = String(booking && booking.payment_status || "").toLowerCase();
    if (/^(paid|supplier_payment_pending|supplier_paid)$/.test(payment)) return 4;
    if (/proof_received|partially_paid/.test(payment)) return 3;
    if ((payment !== "not_requested" && /request_sent|payment_pending|pending/.test(payment)) || /payment_pending/.test(status)) return 2;
    return 1;
  }

  function paymentClearanceTitle(booking) {
    const level = paymentClearanceLevel(booking);
    if (level >= 4) return "Payment verified. Kridiya is continuing supplier confirmation.";
    if (level === 3) return "Payment verification or remaining funds are pending.";
    if (level === 2) return "Payment request sent. Clearance is waiting from your company.";
    return "Quote accepted. Clearance is the next control.";
  }

  function paymentClearanceCopy(booking) {
    const level = paymentClearanceLevel(booking);
    if (level >= 4) return "Payment is complete. Kridiya must still confirm the supplier before tickets or vouchers are released.";
    if (level === 3) return "Proof alone does not clear payment. Kridiya must verify funds covering the approved quote; partial payment and an LPO do not authorize supplier confirmation.";
    if (level === 2) return "Submit payment proof or a transfer reference against the exact payment request. An LPO may be recorded for procurement but does not substitute for verified funds.";
    return "Bookings are prepaid. Kridiya verifies matching funds before supplier confirmation. An LPO or payment screenshot alone does not clear the booking.";
  }

  function paymentClearanceTimelineHTML(booking) {
    const level = paymentClearanceLevel(booking);
    const steps = [
      ["Quote accepted", 1],
      ["Payment requested", 2],
      ["Verification / balance pending", 3],
      ["Funds verified", 4]
    ];
    return '<ol class="payment-clearance-timeline" aria-label="Payment clearance progress">' + steps.map(function (step) {
      const state = level > step[1] ? "is-done" : level === step[1] ? "is-current" : "";
      return '<li class="' + state + '"><span></span><b>' + KridiyaAuth.escapeHTML(step[0]) + '</b></li>';
    }).join("") + '</ol>';
  }

  function renderCorporateAttentionQueue(bookings, quotes, company) {
    const list = document.getElementById("corp-attention-list");
    if (!list) return;
    const items = [];
    const sentQuotes = (quotes || []).filter(function (quote) {
      return String(quote.status || "") === "sent";
    });
    const activeBookings = (bookings || []).filter(function (booking) {
      return !/completed|cancelled|refunded/i.test(String(booking.status || ""));
    });
    const paymentItems = (bookings || []).filter(function (booking) {
      return booking.payment_status && !/paid|supplier_paid|refunded|not_requested/i.test(String(booking.payment_status));
    });
    const handoffItems = (bookings || []).filter(function (booking) {
      return isCorporatePaymentHandoff(booking);
    });
    const supplierItems = (bookings || []).filter(function (booking) {
      return /awaiting_supplier_confirmation|supplier_commitment_requested|supplier_commitment_failed|supplier_offer_expired|revised_quote_required/.test(String(booking.supplier_fulfilment_status || ""));
    });
    const documentItems = (bookings || []).filter(function (booking) {
      return booking.document_count || (booking.document_status && !/not_started/i.test(String(booking.document_status)));
    });

    if (sentQuotes.length) {
      items.push({
        tone: "quote",
        label: "Quote review",
        title: sentQuotes.length + " quote option" + (sentQuotes.length === 1 ? "" : "s") + " waiting",
        copy: company.can_approve_quotes ? "Accept or decline released options from Kridiya." : "Quote is visible, but approval access is not enabled for this login.",
        tab: "quotes"
      });
    }
    if (handoffItems.length) {
      items.push({
        tone: "payment",
        label: "Prepaid booking",
        title: handoffItems.length + " accepted quote" + (handoffItems.length === 1 ? "" : "s") + " waiting for clearance",
        copy: "Verified funds covering the approved quote are required before supplier confirmation. LPO records do not replace payment.",
        tab: "bookings"
      });
    } else if (paymentItems.length) {
      items.push({
        tone: "payment",
        label: "Payment",
        title: paymentItems.length + " payment update" + (paymentItems.length === 1 ? "" : "s"),
        copy: company.can_view_finance ? "Review visible invoices, receipts, or payment status." : "Finance records will appear here after Kridiya releases access.",
        tab: "finance"
      });
    }
    if (supplierItems.length) {
      items.push({
        tone: "booking",
        label: "Supplier confirmation",
        title: supplierItems.length + " paid booking" + (supplierItems.length === 1 ? "" : "s") + " awaiting supplier completion",
        copy: "Verified payment is complete. Supplier commitment and any commercial changes are being handled separately.",
        tab: "bookings"
      });
    }
    if (documentItems.length) {
      items.push({
        tone: "document",
        label: "Documents",
        title: documentItems.length + " booking" + (documentItems.length === 1 ? "" : "s") + " with document activity",
        copy: "Open released tickets, vouchers, invoices, receipts, or files.",
        tab: "documents"
      });
    }
    if (!items.length && activeBookings.length) {
      items.push({
        tone: "booking",
        label: "Tracking",
        title: activeBookings.length + " active booking record" + (activeBookings.length === 1 ? "" : "s"),
        copy: "Track quote, payment, document, and status movement.",
        tab: "bookings"
      });
    }
    if (!items.length) {
      items.push({
        tone: "request",
        label: "Ready",
        title: "No pending action",
        copy: "Submit a new request whenever your company has a travel requirement.",
        tab: "request"
      });
    }

    list.innerHTML = items.map(function (item) {
      return '<article class="portal-attention-item is-' + KridiyaAuth.escapeHTML(item.tone) + '">' +
        '<div><span>' + KridiyaAuth.escapeHTML(item.label) + '</span><b>' + KridiyaAuth.escapeHTML(item.title) + '</b><p>' + KridiyaAuth.escapeHTML(item.copy) + '</p></div>' +
        '<button class="btn btn-outline btn-sm" type="button" data-portal-tab-open="' + KridiyaAuth.escapeHTML(item.tab) + '">Open</button>' +
      '</article>';
    }).join("");
  }

  function renderCorporateActivityRail(bookings, quotes) {
    const rail = document.getElementById("corp-activity-rail");
    if (!rail) return;
    const activities = [];
    (quotes || []).forEach(function (quote) {
      activities.push({
        when: quote.created_at || quote.updated_at,
        tone: "quote",
        label: "Quote",
        title: quote.title || "Quote option released",
        meta: [quote.booking_reference, quote.status ? KridiyaAuth.statusLabel(quote.status) : "Sent", money(quote.price_amount, quote.currency || "AED")].filter(Boolean).join(" / "),
        tab: "quotes"
      });
    });
    (bookings || []).forEach(function (booking) {
      const stage = booking.document_status && booking.document_status !== "not_started"
        ? "Documents"
        : isCorporatePaymentHandoff(booking)
        ? "Payment"
        : /confirmed|ticketed|completed/i.test(String(booking.status || ""))
        ? "Confirmed"
        : "Request";
      activities.push({
        when: booking.created_at || booking.updated_at || booking.travel_start,
        tone: stage.toLowerCase(),
        label: stage,
        title: booking.title || booking.booking_reference || "Corporate booking",
        meta: [booking.booking_reference, KridiyaAuth.statusLabel(booking.service_type || "Corporate"), KridiyaAuth.statusLabel(booking.payment_status || "Payment pending")].filter(Boolean).join(" / "),
        tab: stage === "Documents" ? "documents" : stage === "Payment" ? "finance" : "bookings"
      });
    });
    activities.sort(function (a, b) {
      return new Date(b.when || 0) - new Date(a.when || 0);
    });
    if (!activities.length) {
      rail.innerHTML = '<div class="portal-empty">No company movement yet. Submit a request and the activity rail will start tracking Kridiya handling.</div>';
      return;
    }
    rail.innerHTML = activities.slice(0, 5).map(function (item) {
      const date = item.when ? new Date(item.when).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "Live";
      return '<article class="portal-activity-item is-' + KridiyaAuth.escapeHTML(item.tone) + '">' +
        '<span>' + KridiyaAuth.escapeHTML(item.label) + '</span>' +
        '<div><b>' + KridiyaAuth.escapeHTML(item.title) + '</b><small>' + KridiyaAuth.escapeHTML(item.meta || "Corporate portal record") + '</small></div>' +
        '<em>' + KridiyaAuth.escapeHTML(date) + '</em>' +
        '<button class="btn btn-outline btn-sm" type="button" data-portal-tab-open="' + KridiyaAuth.escapeHTML(item.tab) + '">Open</button>' +
      '</article>';
    }).join("");
  }

  function corporateQuotesUnavailable() {
    const quotes = [];
    quotes.loadFailed = true;
    return quotes;
  }

  function renderCorporateQuotes(quotes, activeCompany) {
    const quoteList = document.getElementById("corp-quote-list");
    const permission = document.getElementById("corp-quote-permission");
    if (!quoteList) return;
    if (window.KridiyaWorkspace.revoked()) return;
    if (corporateHistory && corporateHistory.activeCompany.corporate_account_id === activeCompany.corporate_account_id) {
      corporateHistory.quotes = quotes;
      renderCorporateHistoryControls();
    }
    if (quotes.loadFailed) {
      quoteList.innerHTML = '<div class="portal-empty" role="status"><h3>Quote status unavailable</h3><p>Quotes could not be loaded. Refresh the workspace to try again.</p><button class="btn btn-outline" type="button" onclick="location.reload()">Refresh workspace</button></div>';
      if (permission) permission.textContent = "Status unavailable";
      return;
    }

    if (permission) {
      permission.textContent = activeCompany.can_approve_quotes ? "Approval enabled" : "View only";
      permission.classList.toggle("is-allowed", !!activeCompany.can_approve_quotes);
    }

    if (!quotes.length) {
      quoteList.innerHTML = '<div class="quote-desk-empty">' +
        '<span>Quote approval desk</span>' +
        '<b>No released quotes yet</b>' +
        '<p>Your advisor’s quotes appear here with prices, validity and booking conditions. Review the details before approving an option.</p>' +
        '<button class="btn btn-outline btn-sm" type="button" onclick="window.KridiyaOpenCorporateTab && window.KridiyaOpenCorporateTab(\'request\')">Send a request</button>' +
      '</div>';
      return;
    }

    quoteList.innerHTML = '<div class="quote-desk-head">' +
      '<div><span>Approval desk</span><b>' + KridiyaAuth.escapeHTML(String(quotes.length)) + ' quote option(s)</b></div>' +
      '<small>' + KridiyaAuth.escapeHTML(activeCompany.can_approve_quotes ? "This login can approve quotes." : "This login can view quotes only.") + '</small>' +
    '</div>' + quotes.map(function (quote) {
      const status = String(quote.status || "sent");
      const alreadyActed = !!quote.my_approval_decision;
      const revisionPending = !!quote.revision_pending;
      const canAct = !!activeCompany.can_approve_quotes && quote.can_approve !== false && status === "sent" && !alreadyActed && !revisionPending;
      const validUntil = quote.valid_until
        ? new Date(quote.valid_until).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        : "No expiry set";
      const amount = String(quote.currency || "AED") + " " + Number(quote.price_amount || 0).toLocaleString("en-GB", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      const bookingTitle = quote.booking_title || "Corporate booking";
      const service = KridiyaAuth.statusLabel(quote.service_type || "corporate");
      const statusTone = status === "accepted" ? "is-accepted" : status === "declined" ? "is-declined" : "is-sent";
      const approvalLabel = status === "accepted" ? "Accepted" : status === "declined" ? "Declined" : status === "expired" ? "Expired" : status === "superseded" ? "Superseded" : revisionPending ? "Revision requested" : alreadyActed
        ? "Approval " + String(quote.approval_count || 1) + " of " + String(quote.required_approvals || 2)
        : canAct ? "Action needed" : "View only";
      const responseNote = status === "accepted"
        ? "Quote accepted. Kridiya verifies prepaid funds before supplier confirmation. An LPO does not replace payment."
        : status === "declined"
          ? "Quote declined. Kridiya has been notified and can prepare another option if required."
          : status === "expired"
            ? "This option has expired. Request a fresh quote from the Kridiya corporate desk."
            : status === "superseded"
              ? "A newer issued version replaced this option. Review the latest version before deciding."
            : revisionPending
              ? "Your revision request is open with Kridiya Corporate Desk. Approval is paused until a revised option is released."
          : alreadyActed
            ? "Your decision is recorded. A different authorized approver must complete this quote."
            : "This login can view quotes only. Contact Kridiya corporate desk if approval access is required.";
      return '<article class="portal-quote-card ' + statusTone + '" data-quote-id="' + KridiyaAuth.escapeHTML(quote.id) + '" data-quote-version="' + KridiyaAuth.escapeHTML(String(quote.quote_version || "")) + '">' +
        '<div class="quote-packet-top">' +
          '<div><small>' + KridiyaAuth.escapeHTML((quote.booking_reference || "Corporate quote") + " · Version " + String(quote.quote_version || "—")) + '</small><h3>' + KridiyaAuth.escapeHTML(quote.title || bookingTitle || "Travel option") + '</h3></div>' +
          '<div class="quote-amount"><span>Total quote</span><b>' + KridiyaAuth.escapeHTML(amount) + '</b></div>' +
        '</div>' +
        '<p>' + KridiyaAuth.escapeHTML(quote.description || bookingTitle || "Quote option prepared by Kridiya corporate desk.") + '</p>' +
        '<div class="quote-detail-grid">' +
          '<div><span>Status</span><b>' + KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(status)) + '</b></div>' +
          '<div><span>Valid until</span><b>' + KridiyaAuth.escapeHTML(validUntil) + '</b></div>' +
          '<div><span>Service</span><b>' + KridiyaAuth.escapeHTML(service) + '</b></div>' +
          '<div><span>Approval</span><b>' + KridiyaAuth.escapeHTML(approvalLabel) + '</b></div>' +
        '</div>' +
        '<div class="portal-quote-terms"><span>Commercial notes</span><p>' + KridiyaAuth.escapeHTML(quote.terms || "Final booking requires company approval, verified prepaid funds, and supplier availability confirmation.") + '</p></div>' +
        (canAct ? '<div class="portal-quote-actions"><button class="btn btn-primary" type="button" data-quote-action="accepted">Accept quote</button><button class="btn btn-outline" type="button" data-quote-action="revision">Request revision</button><button class="btn btn-outline" type="button" data-quote-action="declined">Decline option</button></div>' : '<div class="quote-view-note">' + KridiyaAuth.escapeHTML(responseNote) + '</div>') +
      '</article>';
    }).join("");

    quoteList.querySelectorAll("[data-quote-action]").forEach(function (button) {
      button.addEventListener("click", async function (event) {
        const card = button.closest("[data-quote-id]");
        const status = button.dataset.quoteAction;
        if (!card || !status) return;
        const buttons = Array.from(card.querySelectorAll("button"));
        buttons.forEach(function (btn) { btn.disabled = true; });
        try {
          if (status === "revision") {
            const message = await window.KridiyaWorkspace.dialog({ title: "Request a quote revision", description: "Tell your corporate desk what needs to change. Approval pauses while the revised option is prepared.", confirm: "Request revision", input: true, instant: event.detail === 0 });
            if (message === null) {
              buttons.forEach(function (btn) { btn.disabled = false; });
              if (!window.KridiyaWorkspace.revoked()) button.focus();
              return;
            }
            await KridiyaAuth.requestMyCorporateQuoteRevision(card.dataset.quoteId, message);
            toast("Revision request sent to Kridiya Corporate Desk.");
            const revisedQuotes = await KridiyaAuth.listMyCorporateQuotes(activeCompany.corporate_account_id);
            renderCorporateQuotes(revisedQuotes, activeCompany);
            return;
          }
          const decision = await KridiyaAuth.respondMyCorporateQuote(card.dataset.quoteId, card.dataset.quoteVersion, status);
          if (status === "accepted" && !decision.finalized) {
            const currentQuote = quotes.find(function (quote) { return quote.id === card.dataset.quoteId; });
            if (currentQuote) Object.assign(currentQuote, { my_approval_decision: "approved", approval_count: decision.approval_count, required_approvals: decision.required_approvals });
            card.querySelector(".portal-quote-actions").innerHTML = '<div class="quote-view-note">Approval '+KridiyaAuth.escapeHTML(decision.approval_count)+' of '+KridiyaAuth.escapeHTML(decision.required_approvals)+' recorded. A different authorized approver must complete this quote.</div>';
            toast("Your approval was recorded. Another authorized approver is required.");
            return;
          }
          toast(status === "accepted" ? "Required approvals complete. Quote accepted." : "Quote declined. Your decision has been recorded.");
          const fresh = await Promise.all([
            KridiyaAuth.listMyCorporateBookings(activeCompany.corporate_account_id),
            KridiyaAuth.listMyCorporateQuotes(activeCompany.corporate_account_id)
          ]);
          renderCorporatePortal([activeCompany], fresh[0], activeCompany, fresh[1]);
          renderCorporateQuotes(fresh[1], activeCompany);
          loadCorporatePortalDetails(fresh[0], activeCompany);
        } catch (err) {
          toast(errorMessage(err, "Could not update this quote."));
          buttons.forEach(function (btn) { btn.disabled = false; });
        }
      });
    });
  }

  function initCorporatePortalTabs() {
    const buttons = Array.from(document.querySelectorAll("[data-portal-tab]"));
    const panels = Array.from(document.querySelectorAll("[data-portal-panel]"));
    if (!buttons.length || !panels.length) return;

    function openTab(name) {
      if (window.KridiyaWorkspace.revoked()) return;
      if (!name || !panels.some(function (panel) { return panel.dataset.portalPanel === name; }) || !window.KridiyaWorkspace.allowed(name)) name = "overview";
      buttons.forEach(function (button) {
        button.classList.toggle("active", button.dataset.portalTab === name);
        button.setAttribute("aria-selected", String(button.dataset.portalTab === name));
      });
      panels.forEach(function (panel) {
        panel.classList.toggle("active", panel.dataset.portalPanel === name);
        panel.hidden = panel.dataset.portalPanel !== name;
      });
      document.body.dataset.portalSection = name;
      document.querySelectorAll("[data-overview-only]").forEach(function (section) {
        section.hidden = name !== "overview";
      });
      const title = document.getElementById("corp-workspace-title");
      const active = buttons.find(function (button) { return button.dataset.portalTab === name; });
      if (title && active) title.textContent = active.textContent.trim();
      document.getElementById("corp-access-copy").textContent = window.KridiyaWorkspace.describe(name);
      document.title = (active ? active.textContent.trim() : "Overview") + " | Kridiya Company Workspace";
      const sidebarLinks = Array.from(document.querySelectorAll(".portal-sidebar nav a"));
      sidebarLinks.forEach(function (link) {
        const target = link.dataset.portalTabOpen || String(link.getAttribute("href") || "").replace("#", "");
        link.classList.toggle("active", target === name);
        if (target === name) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
      });
      if (location.hash.replace("#", "") !== name) {
        history.pushState(null, "", "#" + name);
      }
    }

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        openTab(button.dataset.portalTab);
      });
    });

    document.addEventListener("click", function (e) {
      const button = e.target.closest("[data-portal-tab-open]");
      if (!button || button.hidden) return;
      if (String(button.getAttribute("href") || "").charAt(0) === "#") e.preventDefault();
      openTab(button.dataset.portalTabOpen);
      document.getElementById("corp-workspace-title").focus({ preventScroll: true });
    });

    window.addEventListener("hashchange", function () {
      const tabFromHash = location.hash.replace("#", "");
      if (tabFromHash) openTab(tabFromHash);
    });

    window.KridiyaOpenCorporateTab = openTab;
    const initialTab = location.hash.replace("#", "");
    openTab(initialTab || "overview");
  }

  async function loadCorporatePortalDetails(bookings, activeCompany) {
    if (window.KridiyaWorkspace.revoked()) return;
    const generation = ++corporateDetailGeneration;
    const cache = corporateDetailCache;
    window.KridiyaWorkspace.recordsUpdated();
    const docList = document.getElementById("corp-document-list");
    const paymentList = document.getElementById("corp-payment-list");
    if (!docList || !paymentList) return;

    docList.innerHTML = '<div class="portal-loading">Checking released documents...</div>';
    paymentList.innerHTML = '<div class="portal-loading">Checking finance records...</div>';

    try {
      // Fetch each loaded page, with bounded concurrency. Earlier successful pages
      // are reused until a workspace refresh; a failed record remains retryable.
      const detailResults = new Array(bookings.length);
      let nextIndex = 0;
      async function worker() {
        while (nextIndex < bookings.length) {
          if (window.KridiyaWorkspace.revoked() || generation !== corporateDetailGeneration) return;
          const index = nextIndex++;
          const booking = bookings[index];
          const key = activeCompany.corporate_account_id + ":" + booking.id + ":" + (booking.updated_at || "");
          let detail = cache.get(key);
          if (!detail) {
            try {
              detail = await KridiyaAuth.getMyCorporateBookingDetail(booking.id);
              if (!detail || !detail.booking || detail.booking.id !== booking.id) detail = null;
              if (detail) cache.set(key, detail);
            } catch (_) { detail = null; }
          }
          detailResults[index] = detail;
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, bookings.length) }, worker));
      if (window.KridiyaWorkspace.revoked() || generation !== corporateDetailGeneration) return;
      const details = detailResults.filter(Boolean);
      corporateLoadedDetailIds = new Set(details.map(function (detail) { return detail.booking.id; }));
      const incomplete = details.length < bookings.length;
      const scopeCopy = "Details loaded for " + details.length + " of " + bookings.length + " loaded bookings. " + (bookings.hasMore ? "Earlier bookings are available below. Document and payment details cover loaded bookings only." : "All currently available booking pages are loaded.");
      ["corp-document-scope", "corp-finance-scope"].forEach(function (id) {
        const target = document.getElementById(id);
        if (target) {
          target.textContent = scopeCopy + (incomplete ? " Some details are unavailable, not zero." : "");
          if (incomplete) {
            const retry = document.createElement("button");
            retry.type = "button";
            retry.className = "btn btn-outline btn-sm";
            retry.dataset.corporateDetailsRetry = "true";
            retry.textContent = "Retry unavailable details";
            target.append(" ", retry);
          }
        }
      });
      const documents = [];
      const payments = [];
      details.forEach(function (detail) {
        const booking = detail.booking || {};
        (detail.documents || []).forEach(function (doc) {
          documents.push(Object.assign({ booking_id: booking.id, booking_reference: booking.booking_reference, booking_title: booking.title }, doc));
        });
        (detail.payments || []).forEach(function (payment) {
          payments.push(Object.assign({ booking_reference: booking.booking_reference, booking_title: booking.title }, payment));
        });
      });

      const docsByBooking = documents.reduce(function (map, doc) {
        const key = doc.booking_id || "unlinked";
        if (!map[key]) map[key] = [];
        map[key].push(doc);
        return map;
      }, {});
      const docChecklist = bookings.length ? '<div class="document-check-grid">' + bookings.map(function (booking) {
        if (!corporateLoadedDetailIds.has(booking.id)) return '<div class="portal-empty"><b>' + KridiyaAuth.escapeHTML(booking.booking_reference || "Booking") + '</b><p>Document details unavailable. Retry to check released files.</p></div>';
        return documentChecklistHTML(booking, docsByBooking[booking.id] || []);
      }).join("") + '</div>' : "";
      docList.innerHTML = '<div class="vault-head">' +
        '<div><span>Document vault</span><b>' + KridiyaAuth.escapeHTML(String(documents.length)) + ' released file(s)</b></div>' +
        '<small>Reviewed travel files appear after explicit release. Receipts follow your finance access.</small>' +
      '</div>' + docChecklist + (documents.length ? documents.map(function (doc) {
        const docType = KridiyaAuth.statusLabel(doc.document_type || "document");
        const view = docPresentation(doc);
        const released = (doc.released_at || doc.created_at)
          ? new Date(doc.released_at || doc.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
          : "Release date pending";
        return '<article class="document-vault-card document-type-' + KridiyaAuth.escapeHTML(view.type) + '">' +
          '<div class="document-vault-main"><i aria-hidden="true"></i><div><small>' + KridiyaAuth.escapeHTML(view.label || docType) + '</small><b>' + KridiyaAuth.escapeHTML(doc.file_name || docType) + '</b><p>' + KridiyaAuth.escapeHTML(doc.booking_reference || "Corporate booking") + ' / ' + KridiyaAuth.escapeHTML(doc.booking_title || "Travel record") + '</p></div>' +
          (doc.storage_path || doc.storage_provider === "microsoft"
            ? '<button class="btn btn-outline btn-sm corporate-doc-download" type="button" data-booking-id="' + KridiyaAuth.escapeHTML(doc.booking_id || "") + '" data-document-id="' + KridiyaAuth.escapeHTML(doc.id) + '" data-storage-path="' + KridiyaAuth.escapeHTML(doc.storage_path) + '" data-storage-provider="' + KridiyaAuth.escapeHTML(doc.storage_provider || (String(doc.storage_path).indexOf("Kridiya Business/") === 0 ? "microsoft" : "supabase")) + '">Download</button>'
            : '<span>Pending file</span>') + '</div>' +
          '<div class="document-vault-meta"><span>Released</span><b>' + KridiyaAuth.escapeHTML(released) + '</b><span>Version</span><b>' + KridiyaAuth.escapeHTML(String(doc.version || 1)) + '</b></div>' +
          '<p>Available in company portal. ' + (doc.delivery_status === "captured_local_only" ? 'Delivery captured locally; no message sent.' : 'Delivery not recorded.') + '</p>' +
          (doc.storage_provider === "local_capture" ? '<button type="button" class="btn btn-outline btn-sm corporate-doc-handover" data-document-id="'+KridiyaAuth.escapeHTML(doc.id)+'">Confirm document handover</button><small>After downloading, confirm you received this version. This does not record email delivery.</small>' : '') +
        '</article>';
      }).join("") : '<div class="vault-empty"><span>Released files</span><b>' + (incomplete ? 'Document check incomplete' : 'No documents released for loaded bookings') + '</b><p>Tickets, hotel vouchers, visa copies, insurance policies, and receipts appear after release. Load earlier bookings to check their documents.</p></div>');
      initCorporateDocumentDownloads(docList);

      const paymentHandoffs = bookings.filter(function (booking) {
        return isCorporatePaymentHandoff(booking);
      });
      const handoffHTML = paymentHandoffs.length ? '<div class="finance-ledger-head payment-handoff-head">' +
        '<div><span>Payment verification</span><b>' + KridiyaAuth.escapeHTML(String(paymentHandoffs.length)) + ' accepted booking' + (paymentHandoffs.length === 1 ? "" : "s") + ' awaiting payment verification</b></div>' +
        '<small>Check the payment status and any outstanding steps for these bookings.</small>' +
      '</div>' + paymentHandoffs.map(function (booking) {
        return '<article class="finance-ledger-card payment-handoff-card">' +
          '<div class="finance-ledger-main"><div><small>' + KridiyaAuth.escapeHTML(booking.booking_reference || "Corporate booking") + '</small><b>' + KridiyaAuth.escapeHTML(booking.title || KridiyaAuth.statusLabel(booking.service_type || "Corporate booking")) + '</b><p>' + KridiyaAuth.escapeHTML(paymentClearanceCopy(booking)) + '</p></div><span>' + KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(booking.status || "payment_pending")) + '</span></div>' +
          '<div class="finance-ledger-meta"><span>Amount</span><b>' + KridiyaAuth.escapeHTML(booking.amount ? String(booking.currency || "AED") + " " + String(booking.amount) : "As quoted") + '</b><span>Payment</span><b>' + KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(booking.payment_status || "pending clearance")) + '</b></div>' +
          paymentClearanceTimelineHTML(booking) +
        '</article>';
      }).join("") : "";

      paymentList.innerHTML = payments.length ? '<div class="finance-ledger-head">' +
        '<div><span>Payment records</span><b>' + KridiyaAuth.escapeHTML(String(payments.length)) + ' payment record(s)</b></div>' +
        '<small>These records are available to your company role.</small>' +
      '</div>' + payments.map(function (payment) {
        const paidAt = payment.created_at
          ? new Date(payment.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
          : "Date pending";
        return '<article class="finance-ledger-card">' +
          '<div class="finance-ledger-main"><div><small>' + KridiyaAuth.escapeHTML(payment.payment_reference || "Payment record") + '</small><b>' + KridiyaAuth.escapeHTML(String(payment.currency || "AED")) + ' ' + KridiyaAuth.escapeHTML(String(payment.amount || "0")) + '</b><p>' + KridiyaAuth.escapeHTML(payment.booking_reference || payment.booking_title || "Corporate booking") + '</p></div><span>' + KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(payment.status || payment.method || "payment")) + '</span></div>' +
          '<div class="finance-ledger-meta"><span>Method</span><b>' + KridiyaAuth.escapeHTML(KridiyaAuth.statusLabel(payment.method || "not set")) + '</b><span>Date</span><b>' + KridiyaAuth.escapeHTML(paidAt) + '</b></div>' +
        '</article>';
      }).join("") + handoffHTML : handoffHTML || '<div class="vault-empty"><span>Payment records</span><b>' + (activeCompany.can_view_finance ? (incomplete ? "Finance check incomplete" : "No finance records for loaded bookings") : "Finance access pending") + '</b><p>' + (activeCompany.can_view_finance ? "Payment details cover loaded bookings only. Load earlier bookings or retry unavailable details to extend this view." : "Payment records are available to company members with finance access. Contact the corporate desk to ask about your access.") + '</p></div>';

    } catch (err) {
      if (window.KridiyaWorkspace.revoked() || generation !== corporateDetailGeneration) return;
      docList.innerHTML = '<div class="portal-empty">Could not load document records yet.</div>';
      paymentList.innerHTML = '<div class="portal-empty">Could not load finance records yet.</div>';
    }
  }

  function initCorporateDocumentDownloads(docList) {
    if (!docList || docList.dataset.downloadsReady === "true") return;
    docList.dataset.downloadsReady = "true";
    docList.addEventListener("click", async function (e) {
      const handover=e.target.closest(".corporate-doc-handover");
      if(handover){handover.disabled=true;try{await KridiyaAuth.acknowledgeCorporateHandover(handover.dataset.documentId);handover.textContent="Handover acknowledged";}catch(err){toast(errorMessage(err,"Could not confirm document handover."));handover.disabled=false;}return;}
      const btn = e.target.closest(".corporate-doc-download");
      if (!btn) return;
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Preparing...";
      try {
        await KridiyaAuth.openCorporateBookingDocument(btn.dataset.bookingId, btn.dataset.documentId, btn.dataset.storagePath, btn.dataset.storageProvider);
      } catch (err) {
        toast(errorMessage(err, "Could not prepare this corporate document."));
      }
      btn.disabled = false;
      btn.textContent = label;
    });
  }

  function initCorporatePortalRequest(activeCompany, refresh) {
    const form = document.getElementById("corp-portal-request-form");
    if (!form || form.dataset.ready === "true") return;
    form.dataset.ready = "true";
    if (!activeCompany.can_request) {
      form.innerHTML = '<div class="form-banner error" role="alert">Your login can view this company, but request creation is not enabled yet. Contact the Kridiya corporate desk to activate request access.</div>';
      return;
    }
    initCorporateRequestGuide(form);
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!validateForm(form)) return;
      if (form.start.value && form.end.value && form.end.value < form.start.value) {
        banner(form, "End date cannot be before the start date.", "error");
        form.end.focus();
        return;
      }
      banner(form, "");
      busy(form, true, "Submitting...");
      try {
        const submittedTitle = form.title.value.trim();
        const policyResult = await KridiyaAuth.createMyCorporatePolicyRequest({
          corporateAccountId: activeCompany.corporate_account_id,
          serviceType: form.service.value,
          title: submittedTitle,
          route: form.route.value,
          travelStart: form.start.value,
          travelEnd: form.end.value,
          notes: form.notes.value,
          requestedBudget: form.budget.value === "" ? null : Number(form.budget.value),
          requestedCabin: form.cabin.value || null,
          requestedHotelStars: form.hotel_stars.value === "" ? null : Number(form.hotel_stars.value),
          lpoReady: form.lpo_ready.value === "true"
        });
        form.reset();
        if (typeof refresh === "function") await refresh();
        toast(policyResult && policyResult.review_required ? "Request submitted. A policy review task was created for Kridiya." : "Request submitted and checked against the active company policy.");
        if (typeof window.KridiyaOpenCorporateTab === "function") {
          window.KridiyaOpenCorporateTab("bookings");
        } else {
          banner(form, "Travel request sent to the corporate desk for your company.", "success");
        }
      } catch (err) {
        banner(form, errorMessage(err, "Could not submit corporate request."), "error");
      }
      busy(form, false);
    });
  }

  function initCorporateDocumentRequest(activeCompany, bookings, refresh) {
    const form = document.getElementById("corp-document-request-form");
    if (!form) return;
    const bookingSelect = form.booking_id;
    const hasBookings = Array.isArray(bookings) && bookings.length > 0;
    if (bookingSelect) {
      const currentValue = bookingSelect.value;
      bookingSelect.innerHTML = '<option value="">Choose booking...</option>' + (bookings || []).map(function (booking) {
        const label = [
          booking.booking_reference || "Corporate booking",
          booking.title || KridiyaAuth.statusLabel(booking.service_type || "Travel request")
        ].filter(Boolean).join(" - ");
        return '<option value="' + KridiyaAuth.escapeHTML(booking.id || "") + '" data-reference="' + KridiyaAuth.escapeHTML(booking.booking_reference || "") + '" data-title="' + KridiyaAuth.escapeHTML(booking.title || "") + '" data-route="' + KridiyaAuth.escapeHTML(booking.route_or_destination || "") + '">' + KridiyaAuth.escapeHTML(label) + '</option>';
      }).join("");
      if (!hasBookings) {
        bookingSelect.innerHTML = '<option value="">No company bookings available yet</option>';
      }
      if (currentValue && Array.from(bookingSelect.options).some(function (option) { return option.value === currentValue; })) {
        bookingSelect.value = currentValue;
      }
      bookingSelect.disabled = !hasBookings;
    }
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = !hasBookings;
    if (form.dataset.ready === "true") return;
    form.dataset.ready = "true";
    if (!activeCompany.can_request) {
      form.innerHTML = '<div class="vault-empty compact"><span>Document request</span><b>Request access is not enabled</b><p>Ask Kridiya corporate desk to enable request permission for this portal login.</p></div>';
      return;
    }
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!validateForm(form)) return;
      if (!form.booking_id || !form.booking_id.value) {
        banner(form, "Choose the original booking before requesting a document.", "error");
        if (form.booking_id) form.booking_id.focus();
        return;
      }
      const selected = form.booking_id.options[form.booking_id.selectedIndex];
      const bookingReference = selected ? selected.dataset.reference : "";
      const bookingTitle = selected ? selected.dataset.title : "";
      const docType = form.document_type.value;
      const note = form.note.value.trim();
      banner(form, "");
      busy(form, true, "Requesting...");
      try {
        await KridiyaAuth.createMyCorporateDeskCase({
          corporateAccountId: activeCompany.corporate_account_id,
          category: /Receipt|Monthly statement/.test(docType) ? "finance" : "document", urgency: "normal", bookingId: form.booking_id.value,
          subject: "Document request - " + docType,
          description: [
            "Document handoff request from corporate portal.",
            bookingReference ? "Booking: " + bookingReference : "",
            bookingTitle ? "Title: " + bookingTitle : "",
            "Document needed: " + docType,
            note ? "Company note: " + note : ""
          ].filter(Boolean).join("\n")
        });
        form.reset();
        if (typeof refresh === "function") await refresh();
        window.dispatchEvent(new Event("corporate-case-created"));
        toast("Document case linked to the original booking. No new travel request or external message created.");
      } catch (err) {
        banner(form, errorMessage(err, "Could not send this document request."), "error");
      }
      busy(form, false);
    });
  }

  function initCorporateRequestGuide(form) {
    const guide = document.getElementById("corp-request-guide");
    const service = form.service;
    if (!guide || !service) return;
    const guides = {
      flight: {
        title: "Employee flight booking",
        copy: "Best for staff movement, annual leave, new joiner travel, and urgent rebooking.",
        titlePlaceholder: "e.g. DXB to LHR staff trip",
        routePlaceholder: "Origin, destination, trip type, cabin preference",
        notesPlaceholder: "Traveller names, passport name match, dates, baggage, deadline, approver, payment/LPO details...",
        points: ["Traveller names exactly as passport", "Route, dates, trip type, cabin", "Baggage, airline preference, deadline", "Approver and payment/LPO status"]
      },
      hotel: {
        title: "Hotel corporate rates",
        copy: "Use for company rooms, guest stays, executive stays, event accommodation, or monthly hotel needs.",
        titlePlaceholder: "e.g. Dubai hotel for visiting client",
        routePlaceholder: "City, hotel area, preferred property or star rating",
        notesPlaceholder: "Guest names/count, check-in/out, room type, breakfast, budget, billing contact, deadline...",
        points: ["City or hotel area", "Check-in/out and room count", "Room type, meal plan, budget", "Guest names and billing contact"]
      },
      visa: {
        title: "Business / UAE visit visa",
        copy: "Use for employee business visas, UAE visit visas for company guests, and visa status follow-up.",
        titlePlaceholder: "e.g. UAE visit visa for company guest",
        routePlaceholder: "Nationality, destination country, visa type",
        notesPlaceholder: "Applicant names, nationality, passport validity, travel date, visa type, documents available, urgency...",
        points: ["Applicant names and nationality", "Visa type and destination", "Travel date and urgency", "Passport validity and documents"]
      },
      holiday: {
        title: "Holiday / reward trip",
        copy: "Use for company reward trips, staff annual leave packages, incentives, and leisure group requests.",
        titlePlaceholder: "e.g. Staff reward trip to Georgia",
        routePlaceholder: "Destination, travel month, traveller count",
        notesPlaceholder: "Traveller count, dates, budget, hotel category, inclusions, approvals, payment timeline...",
        points: ["Destination and date window", "Traveller count and rooms", "Budget and inclusions", "Approver and payment timeline"]
      },
      umrah: {
        title: "Corporate Umrah group",
        copy: "Use for respectful group handling, flights, hotels, transfers, visa coordination, and package planning.",
        titlePlaceholder: "e.g. Corporate Umrah group package",
        routePlaceholder: "Departure city, Makkah/Madinah dates, group size",
        notesPlaceholder: "Group size, dates, room sharing, hotel category, transport, visa/passport readiness, coordinator...",
        points: ["Group size and departure city", "Makkah/Madinah date plan", "Room sharing and hotel level", "Visa readiness and coordinator"]
      },
      cruise: {
        title: "Cruise / group travel",
        copy: "Use for event travel, group packages, cruise movement, conferences, and coordinated staff travel.",
        titlePlaceholder: "e.g. Group travel for company event",
        routePlaceholder: "Destination, venue, cruise route, or event city",
        notesPlaceholder: "Group count, event dates, hotel/transfer needs, delegate names, budget, coordinator...",
        points: ["Group count and event dates", "Venue, destination, or cruise route", "Hotel and transfer needs", "Delegate/coordinator details"]
      },
      insurance: {
        title: "Travel insurance",
        copy: "Use for employee insurance, visa-related insurance, group cover, and policy document requests.",
        titlePlaceholder: "e.g. Travel insurance for 4 staff",
        routePlaceholder: "Destination country and travel dates",
        notesPlaceholder: "Traveller names/count, ages if required, destination, travel dates, visa purpose, coverage needs...",
        points: ["Traveller count and names", "Destination and travel dates", "Coverage type or visa purpose", "Policy deadline"]
      },
      other: {
        title: "Other / multiple services",
        copy: "Use when the request includes mixed services or needs Kridiya to advise the right handling route.",
        titlePlaceholder: "e.g. VIP business trip with visa and transfers",
        routePlaceholder: "Main city, route, hotel, event, or destination",
        notesPlaceholder: "Explain the full requirement, services needed, deadline, approver, billing/LPO details, urgency...",
        points: ["Services needed", "People, dates, and destination", "Deadline and priority", "Approver and billing details"]
      }
    };
    function renderGuide() {
      const data = guides[service.value] || null;
      if (!data) {
        guide.innerHTML = '<span>Smart request guide</span><b>Choose a service to see the exact details Kridiya needs.</b><p>This keeps quote preparation clean and reduces WhatsApp back-and-forth.</p>';
        return;
      }
      if (form.title && !form.title.value) form.title.placeholder = data.titlePlaceholder;
      if (form.route) form.route.placeholder = data.routePlaceholder;
      if (form.notes) form.notes.placeholder = data.notesPlaceholder;
      guide.innerHTML = '<span>Smart request guide</span><b>' + KridiyaAuth.escapeHTML(data.title) + '</b><p>' + KridiyaAuth.escapeHTML(data.copy) + '</p><ul>' + data.points.map(function (point) {
        return '<li>' + KridiyaAuth.escapeHTML(point) + '</li>';
      }).join("") + '</ul>';
    }
    service.addEventListener("change", renderGuide);
    renderGuide();
  }

  function renderPortalOverview(items, quotes, requests) {
    const summary = document.getElementById("portal-summary");
    const next = document.getElementById("portal-next-action");
    if (!summary || !next) return;
    const bookings = items.filter(function (item) { return !item.isEnquiry; }).length;
    const enquiries = items.length - bookings;
    summary.innerHTML =
      '<div><span>' + KridiyaAuth.escapeHTML(String(items.length)) + '</span><b>Total items</b><small>' + KridiyaAuth.escapeHTML(bookings + " booking(s), " + enquiries + " enquiry(s)") + '</small></div>' +
      '<div><span>' + KridiyaAuth.escapeHTML(String(quotes.length)) + '</span><b>Quotes</b><small>Active options from our team</small></div>' +
      '<div><span>' + KridiyaAuth.escapeHTML(String(requests.length)) + '</span><b>Requests</b><small>Documents or replies needed</small></div>';
    let tone = "ok";
    let title = "Your portal is ready";
    let text = "You can start a new enquiry or message our team for an update.";
    let href = "index.html";
    let cta = "New enquiry";
    if (requests.length) {
      tone = "warn";
      title = "Action needed";
      text = requests.length + " request(s) need your reply or document update.";
      href = "#enq-list";
      cta = "Review requests";
    } else if (quotes.length) {
      tone = "info";
      title = "Quote available";
      text = quotes.length + " quote option(s) are waiting for your review.";
      href = "#enq-list";
      cta = "View quotes";
    } else if (!items.length) {
      tone = "neutral";
      title = "No linked travel yet";
      text = "Send your first enquiry, or ask our team to attach an existing booking to this account.";
    }
    next.innerHTML = '<div class="portal-next portal-next-' + tone + '"><div><b>' + KridiyaAuth.escapeHTML(title) + '</b><p>' + KridiyaAuth.escapeHTML(text) + '</p></div><a class="btn btn-primary" href="' + KridiyaAuth.escapeHTML(href) + '">' + KridiyaAuth.escapeHTML(cta) + '</a></div>';
  }

  if (page === "reset-password") {
    document.addEventListener("DOMContentLoaded", async function () {
      const form = document.getElementById("reset-password-form");
      initPwToggles(form);
      try { await KridiyaAuth.client(); } catch (e) {}
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (!validateForm(form)) return;
        const issue = KridiyaAuth.passwordIssue(form.password.value);
        if (issue) {
          setFieldError(form.password, issue);
          return;
        }
        if (form.password.value !== form.confirm.value) {
          setFieldError(form.confirm, "Passwords do not match.");
          form.confirm.focus();
          return;
        }
        banner(form, "");
        busy(form, true, "Saving...");
        try {
          await KridiyaAuth.completePasswordReset(form.password.value);
          banner(form, "Password updated. Taking you to your account...", "success");
          setTimeout(function () { location.href = "corporate-account.html"; }, 1000);
        } catch (err) {
          banner(form, errorMessage(err, "Could not update your password."), "error");
          busy(form, false);
        }
      });
    });
  }

  if (page === "forgot-password") {
    document.addEventListener("DOMContentLoaded", async function () {
      const form = document.getElementById("forgot-password-form");
      try { await KridiyaAuth.client(); } catch (e) {}
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (!validateForm(form)) return;
        banner(form, "");
        busy(form, true, "Sending...");
        try {
          await KridiyaAuth.resetPassword(form.email.value);
          banner(form, "If an account matches this email, a reset link will arrive shortly. Check your inbox and use the newest link.", "success");
          form.reset();
        } catch (err) {
          banner(form, errorMessage(err, "Could not send the password reset email. Please try again."), "error");
        }
        busy(form, false);
      });
    });
  }
})();
