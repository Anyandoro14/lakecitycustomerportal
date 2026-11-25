// Generates public/templates/agreement-of-sale-PLACEHOLDER.pdf
//
// The template contract (what a real LakeCity template must also provide to be a drop-in swap):
//   1. AcroForm text fields named exactly as MERGE_FIELDS in supabase/functions/_shared/domain/agreement-fields.ts
//   2. DocuSign anchor strings for signatures: /buyer_sign/ /buyer_date/ and /coownerN_sign/ /coownerN_date/ (N = 1..3)
// Run: npm run generate:agreement

import { mkdirSync, writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const FIELDS = [
  ["agreement_date", "Agreement date"],
  ["buyer_full_name", "Purchaser full name"],
  ["buyer_dob", "Date of birth"],
  ["buyer_id_type", "ID type"],
  ["buyer_id_country", "ID issuing country"],
  ["buyer_id_number", "ID number"],
  ["buyer_id_expiry", "ID expiry"],
  ["buyer_physical_address", "Residential address"],
  ["buyer_postal_address", "Postal address"],
  ["buyer_country", "Country of residence"],
  ["buyer_email", "Email"],
  ["buyer_phone", "Phone"],
];
const PROPERTY_FIELDS = [
  ["stand_number", "Stand number"],
  ["stand_size", "Stand size"],
  ["purchase_price", "Purchase price (VAT incl.)"],
  ["deposit", "Initial deposit"],
  ["instalment", "Monthly instalment"],
  ["term_months", "Term (months)"],
  ["payment_reference", "Deposit payment reference"],
  ["collection_account_id", "Collection schedule account"],
];

const doc = await PDFDocument.create();
doc.setTitle("AGREEMENT OF SALE - PLACEHOLDER TEMPLATE - NOT A LEGAL DOCUMENT");
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const form = doc.getForm();
const W = 595.28;
const H = 841.89;
const M = 56;
const GREEN = rgb(0.043, 0.239, 0.18);
const RED = rgb(0.7, 0.1, 0.1);

let page;
let y;
let pageNo = 0;

function newPage() {
  page = doc.addPage([W, H]);
  pageNo += 1;
  y = H - M;
  page.drawText("AGREEMENT OF SALE - PLACEHOLDER TEMPLATE - NOT A LEGAL DOCUMENT", { x: M, y: H - 30, size: 8, font: bold, color: RED });
  page.drawText(`Page ${pageNo}`, { x: W - M - 40, y: 24, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
  page.drawText("PLACEHOLDER - replace with the approved LakeCity template", { x: M, y: 24, size: 8, font, color: RED });
}

function ensure(h) {
  if (y - h < M + 20) newPage();
}

function para(text, size = 10, f = font, color = rgb(0.1, 0.1, 0.1)) {
  const max = W - M * 2;
  const words = text.split(" ");
  let line = "";
  const lines = [];
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (f.widthOfTextAtSize(t, size) > max && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  lines.push(line);
  for (const l of lines) {
    ensure(size + 5);
    page.drawText(l, { x: M, y: y - size, size, font: f, color });
    y -= size + 5;
  }
  y -= 4;
}

function field(name, label, height = 18) {
  ensure(height + 8);
  page.drawText(label, { x: M, y: y - 12, size: 9, font, color: rgb(0.35, 0.35, 0.35) });
  const tf = form.createTextField(name);
  if (name === "co_owners") tf.enableMultiline();
  tf.addToPage(page, { x: M + 170, y: y - height + 2, width: W - M * 2 - 170, height, font, borderWidth: 0.5, borderColor: rgb(0.7, 0.7, 0.7) });
  tf.setFontSize(9);
  y -= height + 6;
}

/** White anchor text: invisible on paper, found by DocuSign anchor tabs. */
function anchor(text, x, yy) {
  page.drawText(text, { x, y: yy, size: 6, font, color: rgb(1, 1, 1) });
}

function signatureBlock(label, signAnchor, dateAnchor) {
  ensure(70);
  page.drawText(label, { x: M, y: y - 12, size: 10, font: bold });
  y -= 46;
  page.drawLine({ start: { x: M, y }, end: { x: M + 220, y }, thickness: 0.7 });
  page.drawLine({ start: { x: M + 280, y }, end: { x: M + 420, y }, thickness: 0.7 });
  anchor(signAnchor, M + 2, y + 6);
  anchor(dateAnchor, M + 282, y + 6);
  page.drawText("Signature", { x: M, y: y - 11, size: 8, font });
  page.drawText("Date", { x: M + 280, y: y - 11, size: 8, font });
  y -= 30;
}

newPage();
page.drawRectangle({ x: M, y: y - 60, width: W - M * 2, height: 60, color: rgb(0.99, 0.95, 0.95), borderColor: RED, borderWidth: 1 });
page.drawText("AGREEMENT OF SALE - PLACEHOLDER TEMPLATE", { x: M + 12, y: y - 26, size: 15, font: bold, color: RED });
page.drawText("NOT A LEGAL DOCUMENT. FOR DEVELOPMENT AND TESTING ONLY.", { x: M + 12, y: y - 46, size: 10, font: bold, color: RED });
y -= 80;
para("LakeCity - Residential Stand", 13, bold, GREEN);
para("PLACEHOLDER: This document stands in for LakeCity's real Agreement of Sale, which has not yet been supplied. It demonstrates merge fields, multi-page scrolling and DocuSign signature placement. None of the clauses below are legal terms.");

para("1. PARTIES", 11, bold, GREEN);
para("1.1 The Seller: LakeCity (PLACEHOLDER legal entity name, registration number and address TBC).");
para("1.2 The Purchaser(s):");
for (const [n, l] of FIELDS) field(n, l);
field("co_owners", "Co-owner(s)", 54);

para("2. THE PROPERTY AND PRICE", 11, bold, GREEN);
for (const [n, l] of PROPERTY_FIELDS) field(n, l);

const clauses = [
  ["3. PAYMENT", [
    "3.1 PLACEHOLDER: The Purchaser shall pay the initial deposit stated above, followed by monthly instalments for the term stated above, in accordance with the payment schedule issued by the Seller.",
    "3.2 PLACEHOLDER: The monthly instalment is calculated as the total purchase price (inclusive of VAT) less the deposit, divided by the term in months.",
    "3.3 PLACEHOLDER: Payments shall be made through the Seller's nominated payment channel (ZikiMall, settlement details TBC).",
  ]],
  ["4. DEFAULT AND RE-ALLOCATION", [
    "4.1 PLACEHOLDER: Should the Purchaser miss three (3) consecutive monthly payments, the Seller may re-allocate the stand.",
    "4.2 PLACEHOLDER: Payments made are non-refundable where the Purchaser has defaulted.",
  ]],
  ["5. FEES AND TRANSFER", [
    "5.1 PLACEHOLDER: A non-refundable Agreement of Sale preparation fee is payable to the Seller's legal practitioners.",
    "5.2 PLACEHOLDER: The Purchaser shall pay statutory stamp duty and conveyancing fees for transfer of the title deed.",
  ]],
  ["6. POSSESSION, RISK AND DEVELOPMENT", [
    "6.1 PLACEHOLDER: Possession, occupation and building conditions TBC.",
    "6.2 PLACEHOLDER: Development guidelines and servicing obligations TBC.",
  ]],
  ["7. GENERAL", [
    "7.1 PLACEHOLDER: Whole agreement, variation, domicilium and governing law clauses TBC.",
    "7.2 PLACEHOLDER: Electronic signature of this agreement via DocuSign is accepted by the parties.",
  ]],
];
for (const [title, items] of clauses) {
  para(title, 11, bold, GREEN);
  for (const c of items) para(c);
}
for (let i = 0; i < 6; i++) {
  para(`PLACEHOLDER filler paragraph ${i + 1}: this text exists so the signer scrolls through a realistic multi-page document inside DocuSign before reaching the signature page. Replace with the real agreement.`, 10, font, rgb(0.45, 0.45, 0.45));
}

newPage();
para("8. SIGNATURES", 11, bold, GREEN);
para("Signed electronically by the Purchaser(s) on the dates shown.");
signatureBlock("Purchaser", "/buyer_sign/", "/buyer_date/");
for (let n = 1; n <= 3; n++) signatureBlock(`Co-owner ${n} (if applicable)`, `/coowner${n}_sign/`, `/coowner${n}_date/`);
para("For the Seller: PLACEHOLDER (countersignature process TBC).", 10, bold);

mkdirSync(new URL("../public/templates/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/templates/agreement-of-sale-PLACEHOLDER.pdf", import.meta.url), await doc.save());
console.log(`Wrote agreement-of-sale-PLACEHOLDER.pdf (${pageNo} pages, ${form.getFields().length} merge fields)`);
