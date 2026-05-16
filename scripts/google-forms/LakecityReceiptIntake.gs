/**
 * LakeCity — Receipt capture → Make webhook (optional: also post straight to Odoo).
 *
 * Reads the submitted row from the response sheet (same pattern as header-based Forms)
 * so file-upload columns and renamed questions still map via pick() aliases.
 *
 * Trigger: From spreadsheet → On form submit
 *
 * Config
 * ------
 * - Best: Project Settings → Script properties → MAKE_WEBHOOK_URL = your Make webhook URL
 *   (works even if this file is pasted into Code.gs without the constant below.)
 * - Or deploy this whole file so the WEBHOOK_URL constant below is included.
 * - SHEET_NAME: exact tab name (default matches Google’s “Form Responses 1”)
 * - SUBMIT_TARGET (Script property, optional): make | odoo  (default: make)
 *   If odoo: set LAKECITY_ODOO_ORIGIN + LAKECITY_API_TOKEN
 */

/** Default Make webhook when MAKE_WEBHOOK_URL script property is not set. */
var WEBHOOK_URL = "https://hook.us2.make.com/bhoso4zsfmneuo8dojja63igi6arxrxs";

/** Resolve webhook: Script property wins (easiest fix when Code.gs omits WEBHOOK_URL). */
function lakecityWebhookUrl_(props) {
  var fromProp = String(props.getProperty("MAKE_WEBHOOK_URL") || "").trim();
  if (fromProp) return fromProp;
  var u = typeof WEBHOOK_URL !== "undefined" ? WEBHOOK_URL : "";
  return String(u || "").trim();
}

/** Response tab name */
var SHEET_NAME = "Form Responses 1";

/**
 * Normalize header for fuzzy matching (lowercase, collapse spaces, strip trailing colon).
 */
function norm_(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/:$/, "");
}

/**
 * Pick first non-empty answer whose header matches any of possibleHeaders (normalized).
 */
function pick_(answers, possibleHeaders) {
  var wanted = [];
  for (var p = 0; p < possibleHeaders.length; p++) {
    wanted.push(norm_(possibleHeaders[p]));
  }
  for (var k in answers) {
    if (!answers.hasOwnProperty(k)) continue;
    if (wanted.indexOf(norm_(k)) === -1) continue;
    var v = answers[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return v;
    }
  }
  return "";
}

function buildAnswersMap_(sheet, row) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var values = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
  var answers = {};
  for (var i = 0; i < headers.length; i++) {
    var key = String(headers[i] || "").trim();
    if (!key) continue;
    answers[key] = values[i];
  }
  return answers;
}

/**
 * EDIT possibleHeaders arrays to match your form’s question titles / variants.
 */
function onFormSubmit(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("LakeCity: sheet not found: " + SHEET_NAME);

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return;

  var row =
    e && e.range && typeof e.range.getRow === "function" ? e.range.getRow() : lastRow;
  if (row < 2 || row > lastRow) row = lastRow;

  var answers = buildAnswersMap_(sheet, row);

  var standNumber = pick_(answers, ["Stand Number", "Stand number", "Stand"]);
  var receiptLink = pick_(answers, [
    "Receipt",
    "Receipt Link",
    "Link to receipt",
    "Receipt URL",
    "Upload your receipt",
  ]);
  var amount = pick_(answers, ["Amount", "Payment Amount", "Amount Paid"]);
  var payerName = pick_(answers, [
    "Name",
    "Full Name",
    "Payer Name",
    "Customer Name",
  ]);

  var paymentMethod = pick_(answers, ["Payment Method", "Method of payment"]);
  var receiptDate = pick_(answers, ["Receipt Date", "Payment Date", "Date"]);
  var enteredBy = pick_(answers, ["Receipt Entered by", "Entered by"]);

  var props = PropertiesService.getScriptProperties();
  var hook = lakecityWebhookUrl_(props);
  var target = (props.getProperty("SUBMIT_TARGET") || "make").toLowerCase();

  var payload = {
    marker: "RECEIPT_CAPTURE_V2",
    uuid: Utilities.getUuid(),
    timestamp: new Date().toISOString(),
    sheet_name: sheet.getName(),
    row: row,

    stand_number: String(standNumber || ""),
    receipt_link: String(receiptLink || ""),
    amount: String(amount || ""),
    payer_name: String(payerName || ""),

    payment_method: String(paymentMethod || ""),
    payment_date: String(receiptDate || ""),
    entered_by: String(enteredBy || ""),

    answers: answers,
  };

  var json = JSON.stringify(payload);

  if (target === "odoo") {
    postToOdoo_(props, json);
  } else {
    if (!hook) throw new Error("LakeCity: set WEBHOOK_URL or Script property MAKE_WEBHOOK_URL");
    postUrl_(hook, json, {});
  }
}

function postUrl_(url, jsonBody, headers) {
  var hdr = Object.assign({ "Content-Type": "application/json" }, headers || {});
  var res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: hdr,
    payload: jsonBody,
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code >= 400) {
    throw new Error("LakeCity POST failed " + code + ": " + res.getContentText());
  }
}

function postToOdoo_(props, jsonBody) {
  var origin = String(props.getProperty("LAKECITY_ODOO_ORIGIN") || "").replace(/\/+$/, "");
  var token = props.getProperty("LAKECITY_API_TOKEN");
  if (!origin || !token) {
    throw new Error("LakeCity: set LAKECITY_ODOO_ORIGIN and LAKECITY_API_TOKEN for SUBMIT_TARGET=odoo");
  }
  postUrl_(origin + "/lakecity/api/v1/receipt/intake", jsonBody, {
    Authorization: "Bearer " + token,
  });
}

/** Run once manually from the Apps Script editor to grant UrlFetch permissions */
function authorizeOnce() {
  UrlFetchApp.fetch("https://www.google.com");
}
