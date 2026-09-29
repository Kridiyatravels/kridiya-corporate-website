"use strict";

// Source: get_my_corporate_activity_report_page. No browser-computed money totals.
// Private state lives in memory and is invalidated before a company/session switch.
(() => {
  const KINDS = {booking_created: "Booking created", verified_receipt: "Verified receipt", completed_refund: "Completed refund"};
  let generation = 0;
  let context = null;
  let state = null;
  let listeners = null;
  const requests = new Set();
  const root = () => document.getElementById("corp-activity-report");
  const find = (id) => document.getElementById(id);
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function decimal(value) {
    if (value === null) return null;
    if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value) || value.length > 200) throw new Error("invalid-report");
    return value;
  }
  function money(value) {
    if (value === null) return "Not recorded";
    const [whole, fraction] = decimal(value).split(".");
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (fraction ? "." + fraction : "");
  }
  function date(value) {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) throw new Error("invalid-report");
    return new Intl.DateTimeFormat("en-GB", {day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",timeZone:"UTC",hour12:false}).format(parsed);
  }
  function sameCursor(left, right) {
    return left?.occurred_at === right?.occurred_at && left?.kind === right?.kind && left?.id === right?.id;
  }
  function validate(data, month, cursor, limit) {
    if (!data || data.period?.month !== month || data.period?.timezone !== "UTC" ||
      typeof data.revision !== "string" || !data.revision || !Array.isArray(data.rows) ||
      !Array.isArray(data.summary?.by_currency) || !Number.isSafeInteger(data.summary?.row_count) || data.summary.row_count < 0 ||
      typeof data.has_more !== "boolean" || data.rows.length > limit ||
      data.scope?.is_account_statement !== false || data.scope?.summary_covers !== "all_eligible_period_records") throw new Error("invalid-report");
    if (data.has_more) {
      const next = data.next_cursor;
      if (!data.rows.length || typeof next?.id !== "string" || !next.id || !KINDS[next.kind] ||
        typeof next.occurred_at !== "string" || !next.occurred_at ||
        !sameCursor(next, data.rows.at(-1)) || sameCursor(next, cursor)) throw new Error("invalid-report");
    } else if (data.next_cursor !== null) throw new Error("invalid-report");
    for (const row of data.rows) {
      if (!KINDS[row.kind] || !row.id || !row.source_id || !row.booking_id || !row.currency) throw new Error("invalid-report");
      decimal(row.amount); date(row.occurred_at);
    }
    for (const row of data.summary.by_currency) {
      if (!row.currency) throw new Error("invalid-report");
      ["booking_amount_total","verified_receipt_amount","completed_refund_amount"].forEach(key => decimal(row[key]));
      ["booking_count","booking_amount_missing_count","verified_receipt_count","completed_refund_count"].forEach(key => {
        if (!Number.isSafeInteger(row[key]) || row[key] < 0) throw new Error("invalid-report");
      });
    }
    return data;
  }
  function message(error) {
    const text = error?.message || "";
    if (/changed after it was loaded/i.test(text)) return "Records changed while this report was open. Reload the report before continuing.";
    if (/access|permission|membership|authori[sz]|suspended/i.test(text)) return "Report access is unavailable. Reload the workspace or contact the corporate desk.";
    if (/non-finite|invalid monetary|invalid money|invalid recorded amounts/i.test(text)) return "A source amount needs correction. Ask the corporate desk to review this month’s records.";
    return "The report could not be verified. Your other workspace sections are available. Please retry or contact the corporate desk.";
  }
  function setStatus(text, error = false) {
    const target = find("corp-report-status");
    if (!target) return;
    target.textContent = text;
    target.classList.toggle("is-error", error);
  }
  function busy(value) {
    state.busy = value;
    root().setAttribute("aria-busy", String(value));
    ["corp-report-reload","corp-report-more","corp-report-export","corp-report-month"].forEach(id => { find(id).disabled = value; });
    if (!value) find("corp-report-export").disabled = !state.report;
  }
  function invalidateReport() {
    state.report = null; state.rows = [];
    find("corp-report-data").hidden = true;
    find("corp-report-empty").hidden = true;
    find("corp-report-totals").replaceChildren(); find("corp-report-records").replaceChildren();
    find("corp-report-more").hidden = true;
    find("corp-report-coverage").textContent = "";
    find("corp-report-freshness").textContent = "";
    find("corp-report-exclusions").textContent = "";
  }
  function invalidatesSnapshot(error) {
    return /access|permission|membership|authori[sz]|suspended|changed after/i.test(error?.message || "");
  }
  async function fetchPage(cursor = null, revision = null, limit = 50) {
    const activeContext = context;
    const month = state.month;
    const controller = new AbortController();
    requests.add(controller);
    let timer;
    const query = activeContext.client.rpc("get_my_corporate_activity_report_page", {
      p_corporate_account_id: activeContext.companyId, p_month: month, p_limit: limit,
      p_after_occurred_at: cursor?.occurred_at || null, p_after_kind: cursor?.kind || null,
      p_after_id: cursor?.id || null, p_expected_revision: revision
    });
    let result;
    try {
      result = await Promise.race([
        typeof query.abortSignal === "function" ? query.abortSignal(controller.signal) : query,
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("report-timeout")); }, 20000); })
      ]);
    } finally { clearTimeout(timer); requests.delete(controller); }
    if (result.error) throw result.error;
    return validate(result.data, month, cursor, limit);
  }
  function addRows(existing, incoming) {
    const ids = new Set(existing.map(row => row.kind + ":" + row.id));
    for (const row of incoming) {
      const key = row.kind + ":" + row.id;
      if (ids.has(key)) throw new Error("invalid-report");
      ids.add(key);
    }
    return [...existing, ...incoming];
  }
  function verifyCoverage(count, report) {
    if (report.has_more ? count >= report.summary.row_count : count !== report.summary.row_count) throw new Error("invalid-report");
  }
  function render() {
    const report = state.report;
    const summary = find("corp-report-totals");
    const records = find("corp-report-records");
    summary.replaceChildren(); records.replaceChildren();
    for (const row of report.summary.by_currency) {
      const tr = element("tr");
      tr.append(element("th", row.currency));
      tr.lastChild.scope = "row";
      const booking = element("td", money(row.booking_amount_total));
      booking.append(element("small", `${row.booking_count} bookings${row.booking_amount_missing_count ? ` · ${row.booking_amount_missing_count} without an amount` : ""}`));
      const receipts = element("td", money(row.verified_receipt_amount));
      receipts.append(element("small", `${row.verified_receipt_count} receipts`));
      const refunds = element("td", money(row.completed_refund_amount));
      refunds.append(element("small", `${row.completed_refund_count} refunds`));
      tr.append(booking, receipts, refunds); summary.append(tr);
    }
    for (const row of state.rows) {
      const tr = element("tr");
      const reference = element("td", row.booking_reference || "Reference unavailable");
      reference.append(element("small", row.booking_title || "Untitled booking"));
      const status = element("td", (row.status || "Not recorded").replace(/_/g, " "));
      if (row.archived) status.append(element("small", "Archived booking"));
      tr.append(element("td", date(row.occurred_at)), element("td", KINDS[row.kind]), reference,
        element("td", row.currency), element("td", money(row.amount)), status);
      records.append(tr);
    }
    find("corp-report-data").hidden = report.summary.row_count === 0;
    find("corp-report-empty").hidden = report.summary.row_count !== 0;
    find("corp-report-more").hidden = !report.has_more;
    find("corp-report-coverage").textContent = `${state.rows.length} of ${report.summary.row_count} activity records shown. Totals cover the entire selected month, including archived bookings.`;
    find("corp-report-freshness").textContent = `Generated ${date(report.generated_at)} UTC · ${report.period.start_date} to ${report.period.end_date_inclusive}`;
    const exclusions = report.exclusions || {};
    const labels = [["unverified_payment_count","payments without verification"],["incomplete_refund_count","refunds without complete evidence"],["unattributed_payment_count","payments without matching company/booking attribution"],["legacy_refund_count","legacy refund records"]];
    find("corp-report-exclusions").textContent = "Excluded record categories: " + labels.map(([key,label]) => `${Number.isSafeInteger(exclusions[key]) ? exclusions[key] : "Unavailable"} ${label}`).join("; ") + ". Categories can overlap and are not monetary totals.";
  }
  async function load(append = false) {
    if (!context?.canFinance || !state || state.busy) return;
    const token = ++generation;
    const previous = state.report;
    busy(true);
    setStatus(append ? "Loading earlier activity…" : "Loading monthly activity…");
    if (!append) {
      state.rows = []; state.report = null;
      find("corp-report-data").hidden = true;
      find("corp-report-empty").hidden = true;
      find("corp-report-totals").replaceChildren(); find("corp-report-records").replaceChildren();
      find("corp-report-coverage").textContent = ""; find("corp-report-freshness").textContent = "";
      find("corp-report-exclusions").textContent = ""; find("corp-report-more").hidden = true;
    }
    try {
      const report = await fetchPage(append ? previous.next_cursor : null, append ? previous.revision : null);
      if (token !== generation) return;
      if (append && report.revision !== previous.revision) throw new Error("Report changed after it was loaded");
      const nextRows = addRows(append ? state.rows : [], report.rows);
      verifyCoverage(nextRows.length, report);
      state.rows = nextRows;
      state.report = report;
      render(); setStatus(report.summary.row_count ? "Monthly activity loaded." : "No eligible activity was recorded for this month.");
    } catch (error) {
      if (token !== generation) return;
      setStatus(message(error), true);
      // Existing pages remain visible as a previous snapshot, but cannot be exported
      // after a permission/revision failure until a fresh reload succeeds.
      if (invalidatesSnapshot(error)) invalidateReport();
    } finally { if (token === generation) busy(false); }
  }
  function csvCell(value, exactDecimal = false) {
    let text = value == null ? "" : String(value);
    if ((exactDecimal && text) || /^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  async function exportCsv() {
    if (!state?.report || state.busy) return;
    const token = ++generation;
    const revision = state.report.revision;
    const companyId = context.companyId;
    const month = state.month;
    busy(true); setStatus("Verifying the full month for export…");
    try {
      let rows = [];
      let cursor = null;
      let report;
      const cursors = new Set();
      do {
        report = await fetchPage(cursor, revision, 200);
        if (token !== generation) return;
        if (report.revision !== revision) throw new Error("Report changed after it was loaded");
        if (report.summary.row_count > 50000) throw new Error("export-limit");
        rows = addRows(rows, report.rows);
        verifyCoverage(rows.length, report);
        cursor = report.next_cursor;
        if (report.has_more) {
          const key = JSON.stringify(cursor);
          if (!report.rows.length || cursors.has(key)) throw new Error("invalid-report");
          cursors.add(key);
        }
      } while (report.has_more);
      if (rows.length !== report.summary.row_count) throw new Error("invalid-report");
      const columns = ["Company ID","Period start UTC","Period end exclusive UTC","Generated at","Revision","Activity","Occurred at UTC","Source type","Source ID","Source reference","Booking ID","Booking reference","Booking title","Service","Currency","Amount (exact decimal text)","Source status","Archived booking"];
      const lines = [columns.map(value => csvCell(value)).join(",")];
      for (const row of rows) {
        const values = [companyId,report.period.start_at,report.period.end_at_exclusive,report.generated_at,revision,KINDS[row.kind],row.occurred_at,row.source_type,row.source_id,row.source_reference,row.booking_id,row.booking_reference,row.booking_title,row.service_type,row.currency,row.amount,row.status,row.archived ? "yes" : "no"];
        lines.push(values.map((value,index) => csvCell(value,index === 15)).join(","));
      }
      const url = URL.createObjectURL(new Blob(["\uFEFF" + lines.join("\r\n")], {type:"text/csv;charset=utf-8"}));
      const link = element("a"); link.href = url; link.download = `kridiya-activity-${month.slice(0,7)}.csv`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(`Exported ${rows.length} records for the full month. Amounts are exact decimal text; this is an activity export, not an account statement.`);
    } catch (error) {
      if (token !== generation) return;
      if (invalidatesSnapshot(error)) invalidateReport();
      setStatus(error?.message === "export-limit" ? "This month exceeds the 50,000-record browser export limit. Ask the corporate desk for a complete operational export." : message(error), true);
    } finally { if (token === generation) busy(false); }
  }
  function reset() {
    generation++; listeners?.abort(); listeners = null; context = null; state = null;
    for (const controller of requests) controller.abort();
    requests.clear();
    const target = root(); if (!target) return;
    target.replaceChildren(); target.removeAttribute("aria-busy");
  }
  async function mount(options) {
    reset();
    const target = root(); if (!target) return;
    if (options.canFinance !== true) { target.append(element("p", "Monthly activity is available to approved company finance members.")); return; }
    context = options;
    listeners = new AbortController();
    const month = new Date().toISOString().slice(0,7);
    state = {month:month + "-01",rows:[],report:null,busy:false};
    // Static application markup only. All returned source values use textContent.
    target.innerHTML = `<div class="activity-controls"><label for="corp-report-month">Reporting month <input id="corp-report-month" type="month" required value="${month}" min="2000-01" max="9999-12"></label><button id="corp-report-reload" class="btn btn-outline" type="button">Load report</button><button id="corp-report-export" class="btn btn-outline" type="button" disabled>Export full month CSV</button></div>
      <p id="corp-report-status" role="status" aria-live="polite"></p><p id="corp-report-freshness" class="activity-meta"></p>
      <div id="corp-report-empty" hidden><h4>No recorded activity</h4><p>Choose another month. Unverified payments and incomplete refunds are reported separately below.</p></div>
      <div id="corp-report-data" hidden><div class="activity-table-wrap" tabindex="0" role="region" aria-label="Full-month totals by currency"><table class="activity-table"><caption>Full-month recorded totals · currencies are not combined</caption><thead><tr><th scope="col">Currency</th><th scope="col">Current booking amounts</th><th scope="col">Verified receipts</th><th scope="col">Completed refunds</th></tr></thead><tbody id="corp-report-totals"></tbody></table></div>
      <p class="activity-definition">Booking amounts use current recorded values for bookings created in the month—not invoiced spend. Receipts and refunds use their recorded event dates; they do not establish bank settlement.</p>
      <div class="activity-table-wrap" tabindex="0" role="region" aria-label="Monthly activity records"><table class="activity-table activity-records"><caption>Source records</caption><thead><tr><th scope="col">Date · UTC</th><th scope="col">Activity</th><th scope="col">Booking</th><th scope="col">Currency</th><th scope="col">Amount</th><th scope="col">Current source status</th></tr></thead><tbody id="corp-report-records"></tbody></table></div></div>
      <p id="corp-report-coverage" class="activity-meta"></p><button id="corp-report-more" class="btn btn-outline" type="button" hidden>Load earlier activity</button>
      <details class="activity-methods"><summary>Sources, exclusions and Excel export</summary><p id="corp-report-exclusions"></p><p>Source: company-scoped booking and canonical payment records. Verified receipts require recorded verification evidence; completed refunds require recorded maker-checker evidence. Archived bookings remain included. There is no opening balance, closing balance, currency conversion or accounting reconciliation.</p><p>The CSV rechecks all pages against one revision and includes source IDs, period and currency. Amounts are protected as decimal text to retain precision in Excel; remove the leading apostrophe only after choosing the appropriate import data type. An unrecorded amount stays blank.</p></details>`;
    const eventOptions = {signal:listeners.signal};
    find("corp-report-reload").addEventListener("click", () => {
      const input = find("corp-report-month");
      if (!input.reportValidity() || !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.value)) return;
      state.month = input.value + "-01"; load();
    }, eventOptions);
    find("corp-report-month").addEventListener("change", () => {
      // Never export the previous period under a newly selected control value.
      state.report = null; state.rows = [];
      find("corp-report-export").disabled = true; find("corp-report-data").hidden = true;
      find("corp-report-more").hidden = true; find("corp-report-empty").hidden = true;
      find("corp-report-coverage").textContent = ""; find("corp-report-freshness").textContent = "";
      find("corp-report-exclusions").textContent = ""; setStatus("Select Load report to show this month.");
    }, eventOptions);
    find("corp-report-more").addEventListener("click", () => load(true), eventOptions);
    find("corp-report-export").addEventListener("click", exportCsv, eventOptions);
    await load();
  }
  window.KridiyaCorporateReport = Object.freeze({mount,reset});
})();
