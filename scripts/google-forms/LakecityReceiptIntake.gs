/**
 * LakeCity — Receipt capture → Odoo (primary). Make.com path is deprecated/legacy.
 *
 * Flow: Google Form submit → this script → POST /lakecity/api/v1/receipt/intake
 *        then email + SMS to ops (success and hard failure).
 *
 * Trigger: From spreadsheet → On form submit
 *
 * Script properties (Project Settings → Script properties)
 * -------------------------------------------------------
 * Required (default path SUBMIT_TARGET=odoo):
 *   LAKECITY_ODOO_ORIGIN   e.g. https://lakecity-standledger.odoo.com  (no trailing slash)
 *   LAKECITY_API_TOKEN     Odoo system param lakecity_loan.api_token
 *
 * Notifications (recommended):
 *   NOTIFY_EMAILS          comma-separated ops emails
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM            E.164 sender (Twilio number)
 *   NOTIFY_SMS_TO          E.164 recipient(s), comma-separated
 *
 * Optional:
 *   SUBMIT_TARGET          odoo (default) | make (deprecated rollback only)
 *   MAKE_WEBHOOK_URL       only if SUBMIT_TARGET=make
 *   NOTIFY_ON_ODOO_FAILURE always|never — default always (notify ops even when Odoo HTTP fails)
 *
 * Product choice: notify ops on Odoo failure too (default). After notify, the script
 * still throws so Form/Apps Script executions surface the error and can retry.
 */

/** @deprecated Legacy Make webhook fallback when MAKE_WEBHOOK_URL property is unset. */
var WEBHOOK_URL = "";

/** Response tab name */
var SHEET_NAME = "Form Responses 1";

/** Resolve webhook: Script property wins. */
function lakecityWebhookUrl_(props) {
  var fromProp = String(props.getProperty("MAKE_WEBHOOK_URL") || "").trim();
  if (fromProp) return fromProp;
  var u = typeof WEBHOOK_URL !== "undefined" ? WEBHOOK_URL : "";
  return String(u || "").trim();
}

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
 * Extract a Google Drive file id from common Forms / Drive URL shapes.
 */
function extractDriveFileId_(url) {
  var s = String(url || "").trim();
  if (!s) return "";
  var m = s.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return "";
}

/**
 * Ensure receipt link is an https URL Odoo can fetch.
 * Drive uploads: set "Anyone with the link" view and rewrite to a stable https URL.
 */
function ensureShareableReceiptUrl_(raw) {
  var url = String(raw || "").trim();
  if (!url) return url;

  var fileId = extractDriveFileId_(url);
  if (fileId) {
    try {
      var file = DriveApp.getFileById(fileId);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (err) {
      Logger.log("LakeCity: could not set Drive sharing for " + fileId + ": " + err);
    }
    return "https://drive.google.com/uc?export=download&id=" + fileId;
  }

  if (url.indexOf("http://") === 0) {
    return "https://" + url.substring("http://".length);
  }
  return url;
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

  var shareableReceipt = ensureShareableReceiptUrl_(receiptLink);

  var props = PropertiesService.getScriptProperties();
  var target = String(props.getProperty("SUBMIT_TARGET") || "odoo").toLowerCase();

  var payload = {
    marker: "RECEIPT_CAPTURE_V2",
    uuid: Utilities.getUuid(),
    timestamp: new Date().toISOString(),
    sheet_name: sheet.getName(),
    row: row,

    stand_number: String(standNumber || ""),
    receipt_link: String(shareableReceipt || ""),
    receipt_url: String(shareableReceipt || ""),
    amount: String(amount || ""),
    payer_name: String(payerName || ""),

    payment_method: String(paymentMethod || ""),
    payment_date: String(receiptDate || ""),
    entered_by: String(enteredBy || ""),

    answers: answers,
  };

  // Keep answers Receipt key shareable when present (Odoo also reads answers.Receipt).
  if (payload.answers && typeof payload.answers === "object") {
    var receiptKeys = ["Receipt", "Receipt Link", "Link to receipt", "Receipt URL", "Upload your receipt"];
    for (var ri = 0; ri < receiptKeys.length; ri++) {
      if (payload.answers[receiptKeys[ri]]) {
        payload.answers[receiptKeys[ri]] = shareableReceipt;
      }
    }
  }

  var json = JSON.stringify(payload);
  var odooResult = null;
  var odooError = null;

  if (target === "make") {
    var hook = lakecityWebhookUrl_(props);
    if (!hook) {
      throw new Error(
        "LakeCity: SUBMIT_TARGET=make is deprecated. Set MAKE_WEBHOOK_URL or switch to SUBMIT_TARGET=odoo."
      );
    }
    try {
      postUrl_(hook, json, {});
      notifyOps_(props, payload, { ok: true, target: "make" }, null);
    } catch (makeErr) {
      notifyOps_(props, payload, null, makeErr);
      throw makeErr;
    }
    return;
  }

  // Primary path: Odoo-direct
  try {
    odooResult = postToOdoo_(props, json);
    notifyOps_(props, payload, odooResult, null);
  } catch (err) {
    odooError = err;
    var notifyOnFail = String(props.getProperty("NOTIFY_ON_ODOO_FAILURE") || "always").toLowerCase();
    if (notifyOnFail !== "never") {
      notifyOps_(props, payload, null, err);
    }
    throw err;
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
  var text = res.getContentText();
  if (code >= 400) {
    throw new Error("LakeCity POST failed " + code + ": " + text);
  }
  var parsed = null;
  try {
    parsed = JSON.parse(text || "{}");
  } catch (e) {
    parsed = { raw: text };
  }
  return { http_status: code, body: parsed };
}

function postToOdoo_(props, jsonBody) {
  var origin = String(props.getProperty("LAKECITY_ODOO_ORIGIN") || "").replace(/\/+$/, "");
  var token = props.getProperty("LAKECITY_API_TOKEN");
  if (!origin || !token) {
    throw new Error("LakeCity: set LAKECITY_ODOO_ORIGIN and LAKECITY_API_TOKEN for SUBMIT_TARGET=odoo");
  }
  return postUrl_(origin + "/lakecity/api/v1/receipt/intake", jsonBody, {
    Authorization: "Bearer " + token,
  });
}

/**
 * Email + SMS ops. Prefer notifying on both success and Odoo failure.
 */
function notifyOps_(props, payload, odooResult, error) {
  var ok = !error;
  var stand = (payload && payload.stand_number) || "";
  var amount = (payload && payload.amount) || "";
  var payer = (payload && payload.payer_name) || "";
  var uuid = (payload && payload.uuid) || "";
  var intakeId =
    odooResult && odooResult.body && odooResult.body.intake_id
      ? odooResult.body.intake_id
      : "";

  var subject = ok
    ? "LakeCity receipt intake OK — stand " + stand
    : "LakeCity receipt intake FAILED — stand " + stand;

  var lines = [
    ok ? "New receipt intake submitted to Odoo." : "Receipt intake FAILED.",
    "",
    "Stand: " + stand,
    "Amount: " + amount,
    "Payer: " + payer,
    "UUID: " + uuid,
    "Receipt URL: " + ((payload && payload.receipt_url) || ""),
    "Entered by: " + ((payload && payload.entered_by) || ""),
    "Payment method: " + ((payload && payload.payment_method) || ""),
    "Payment date: " + ((payload && payload.payment_date) || ""),
  ];
  if (intakeId) lines.push("Odoo intake_id: " + intakeId);
  if (odooResult && odooResult.body && odooResult.body.warnings) {
    lines.push("Warnings: " + JSON.stringify(odooResult.body.warnings));
  }
  if (error) {
    lines.push("");
    lines.push("Error: " + String(error.message || error));
  }
  lines.push("");
  lines.push("Next: Odoo → Lakecity Loans → Receipt intakes (QC)");

  var body = lines.join("\n");
  sendNotifyEmail_(props, subject, body);
  sendNotifySms_(props, ok, stand, amount, uuid, error);
}

function sendNotifyEmail_(props, subject, body) {
  var raw = String(props.getProperty("NOTIFY_EMAILS") || "").trim();
  if (!raw) {
    Logger.log("LakeCity: NOTIFY_EMAILS not set; skipping email");
    return;
  }
  var recipients = raw
    .split(",")
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
  if (!recipients.length) return;

  try {
    MailApp.sendEmail({
      to: recipients.join(","),
      subject: subject,
      body: body,
    });
  } catch (err) {
    Logger.log("LakeCity: MailApp failed, trying GmailApp: " + err);
    GmailApp.sendEmail(recipients.join(","), subject, body);
  }
}

function sendNotifySms_(props, ok, stand, amount, uuid, error) {
  var sid = String(props.getProperty("TWILIO_ACCOUNT_SID") || "").trim();
  var token = String(props.getProperty("TWILIO_AUTH_TOKEN") || "").trim();
  var from = String(props.getProperty("TWILIO_FROM") || "").trim();
  var toRaw = String(props.getProperty("NOTIFY_SMS_TO") || "").trim();
  if (!sid || !token || !from || !toRaw) {
    Logger.log("LakeCity: Twilio props incomplete; skipping SMS");
    return;
  }

  var text = ok
    ? "LakeCity receipt OK stand " + stand + " amt " + amount + " uuid " + String(uuid).slice(0, 8)
    : "LakeCity receipt FAIL stand " + stand + ": " + String((error && error.message) || error).slice(0, 120);

  var recipients = toRaw
    .split(",")
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);

  var endpoint =
    "https://api.twilio.com/2010-04-01/Accounts/" + encodeURIComponent(sid) + "/Messages.json";
  var auth = Utilities.base64Encode(sid + ":" + token);

  for (var i = 0; i < recipients.length; i++) {
    var res = UrlFetchApp.fetch(endpoint, {
      method: "post",
      headers: { Authorization: "Basic " + auth },
      payload: {
        To: recipients[i],
        From: from,
        Body: text,
      },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() >= 400) {
      Logger.log("LakeCity: Twilio SMS failed " + res.getResponseCode() + ": " + res.getContentText());
    }
  }
}

/**
 * Run once manually from the Apps Script editor to grant UrlFetch + Gmail + Drive.
 */
function authorizeOnce() {
  UrlFetchApp.fetch("https://www.google.com");
  try {
    MailApp.getRemainingDailyQuota();
  } catch (e) {
    Logger.log("MailApp authorize: " + e);
  }
  try {
    DriveApp.getRootFolder();
  } catch (e) {
    Logger.log("DriveApp authorize: " + e);
  }
}

/**
 * Dry-run / smoke-test payload (does not POST). Logs the JSON that would be sent.
 * Optionally set DRY_RUN_POST=1 Script property to also POST to Odoo.
 */
function testReceiptIntakePayload() {
  var props = PropertiesService.getScriptProperties();
  var payload = {
    marker: "RECEIPT_CAPTURE_V2",
    uuid: Utilities.getUuid(),
    timestamp: new Date().toISOString(),
    sheet_name: "dry-run",
    row: 0,
    stand_number: "TEST-99",
    receipt_link: "https://example.com/receipt-placeholder.pdf",
    receipt_url: "https://example.com/receipt-placeholder.pdf",
    amount: "1.00",
    payer_name: "Apps Script Dry Run",
    payment_method: "Cash",
    payment_date: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"),
    entered_by: "testReceiptIntakePayload",
    answers: {
      "Stand Number": "TEST-99",
      Amount: "1.00",
      Receipt: "https://example.com/receipt-placeholder.pdf",
      "Payment Method": "Cash",
      "Receipt Entered by": "testReceiptIntakePayload",
    },
  };
  var json = JSON.stringify(payload, null, 2);
  Logger.log(json);

  var doPost = String(props.getProperty("DRY_RUN_POST") || "").trim() === "1";
  if (!doPost) {
    Logger.log("Set Script property DRY_RUN_POST=1 to also POST this payload to Odoo.");
    return payload;
  }

  var result = postToOdoo_(props, JSON.stringify(payload));
  Logger.log(JSON.stringify(result));
  notifyOps_(props, payload, result, null);
  return result;
}
