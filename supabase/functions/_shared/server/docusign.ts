// PARKED (OI-TBC-13): not used by the core wizard. DocuSign eSignature (DEVELOPER / DEMO environment only): JWT grant, embedded envelope, recipient view.
// Docs: https://developers.docusign.com/platform/auth/jwt/jwt-get-token/
//       https://developers.docusign.com/docs/esign-rest-api/esign101/concepts/embedding/focused-view/

import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { SIGNATURE_ANCHORS, buildMergeValues } from "../domain/agreement-fields.ts";
import type { Lead, Stand } from "../domain/types.ts";
import { HttpError, env } from "./http.ts";

const OAUTH_HOST = "account-d.docusign.com"; // demo only, deliberately not configurable
const DEFAULT_BASE_PATH = "https://demo.docusign.net/restapi";

export interface DocuSignConfig {
  integrationKey: string;
  userId: string;
  accountId: string;
  privateKeyPem: string;
  basePath: string;
}

export function docusignConfig(): DocuSignConfig | null {
  const c = {
    integrationKey: env("DOCUSIGN_INTEGRATION_KEY"),
    userId: env("DOCUSIGN_USER_ID"),
    accountId: env("DOCUSIGN_ACCOUNT_ID"),
    privateKeyPem: env("DOCUSIGN_PRIVATE_KEY").replace(/\\n/g, "\n"),
    basePath: env("DOCUSIGN_BASE_PATH") || DEFAULT_BASE_PATH,
  };
  if (!c.integrationKey || !c.userId || !c.accountId || !c.privateKeyPem) return null;
  if (!new URL(c.basePath).hostname.endsWith("demo.docusign.net")) {
    throw new HttpError(500, "DOCUSIGN_BASE_PATH must point at the DocuSign demo environment (demo.docusign.net).");
  }
  return c;
}

// --- JWT grant ---------------------------------------------------------------------------------

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

function derLength(n: number): number[] {
  if (n < 0x80) return [n];
  const out: number[] = [];
  while (n > 0) {
    out.unshift(n & 0xff);
    n >>= 8;
  }
  return [0x80 | out.length, ...out];
}

/** DocuSign issues PKCS#1 ("BEGIN RSA PRIVATE KEY"); WebCrypto needs PKCS#8. Wrap it. */
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  const algId = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const octet = [0x04, ...derLength(pkcs1.length), ...pkcs1];
  const body = [0x02, 0x01, 0x00, ...algId, ...octet];
  return new Uint8Array([0x30, ...derLength(body.length), ...body]);
}

async function importKey(pem: string): Promise<CryptoKey> {
  const isPkcs1 = pem.includes("BEGIN RSA PRIVATE KEY");
  const b64 = pem.replace(/-----(BEGIN|END)[^-]+-----/g, "").replace(/\s+/g, "");
  const der: Uint8Array<ArrayBuffer> = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    isPkcs1 ? pkcs1ToPkcs8(der) : der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

let cachedToken: { token: string; exp: number } | null = null;

export async function getAccessToken(c: DocuSignConfig): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlJson({ alg: "RS256", typ: "JWT" });
  const payload = b64urlJson({ iss: c.integrationKey, sub: c.userId, aud: OAUTH_HOST, iat: now, exp: now + 3600, scope: "signature impersonation" });
  const key = await importKey(c.privateKeyPem);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${payload}`)));
  const assertion = `${header}.${payload}.${b64url(sig)}`;

  const res = await fetch(`https://${OAUTH_HOST}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const body = await res.json();
  if (!res.ok) {
    // consent_required: the impersonated user must grant consent once (see README).
    throw new HttpError(502, `DocuSign auth failed: ${body.error ?? res.status}`);
  }
  cachedToken = { token: body.access_token, exp: Date.now() + body.expires_in * 1000 };
  return cachedToken.token;
}

async function api<T>(c: DocuSignConfig, path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken(c);
  const res = await fetch(`${c.basePath}/v2.1/accounts/${c.accountId}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, `DocuSign API error: ${body.errorCode ?? res.status}`);
  return body as T;
}

// --- Envelope ----------------------------------------------------------------------------------

export interface Signer {
  recipientId: string;
  clientUserId: string;
  name: string;
  email: string;
  routingOrder: number;
}

export function signersFor(lead: Lead): Signer[] {
  if (!lead.offer) throw new HttpError(409, "Offer form has not been submitted.");
  return [
    { recipientId: "1", clientUserId: `buyer-${lead.id}`, name: lead.offer.buyer.fullName, email: lead.contact.email, routingOrder: 1 },
    ...lead.offer.coOwners.map((c, i) => ({
      recipientId: String(i + 2),
      clientUserId: `coowner${i + 1}-${lead.id}`,
      name: c.fullName,
      email: c.email,
      routingOrder: i + 2,
    })),
  ];
}

/** Fills the AcroForm template with lead data and flattens it. Template is swappable (see README). */
export async function buildAgreementPdf(templateUrl: string, lead: Lead, stand: Stand): Promise<Uint8Array> {
  const res = await fetch(templateUrl);
  if (!res.ok) throw new HttpError(500, "Agreement template not found.");
  const pdf = await PDFDocument.load(await res.arrayBuffer());
  const form = pdf.getForm();
  for (const [key, value] of Object.entries(buildMergeValues(lead, stand))) {
    try {
      form.getTextField(key).setText(value);
    } catch {
      console.warn(`[docusign] template has no field "${key}"`);
    }
  }
  form.flatten();
  return pdf.save();
}

export async function createEnvelope(c: DocuSignConfig, lead: Lead, pdf: Uint8Array): Promise<string> {
  const signers = signersFor(lead).map((s, i) => ({
    ...s,
    tabs: {
      signHereTabs: [{ anchorString: i === 0 ? SIGNATURE_ANCHORS.buyerSign : SIGNATURE_ANCHORS.coOwnerSign(i), anchorUnits: "pixels", anchorYOffset: "-6" }],
      dateSignedTabs: [{ anchorString: i === 0 ? SIGNATURE_ANCHORS.buyerDate : SIGNATURE_ANCHORS.coOwnerDate(i), anchorUnits: "pixels", anchorYOffset: "-6" }],
    },
  }));
  const connectUrl = env("DOCUSIGN_CONNECT_URL");
  const body = {
    emailSubject: `Agreement of Sale - Stand ${lead.standNumber} (PLACEHOLDER)`,
    status: "sent",
    documents: [{ documentId: "1", name: `Agreement of Sale - Stand ${lead.standNumber}.pdf`, fileExtension: "pdf", documentBase64: encodeBase64(pdf) }],
    recipients: { signers },
    customFields: { textCustomFields: [{ name: "leadId", value: lead.id, show: "false" }] },
    ...(connectUrl
      ? {
          eventNotification: {
            url: connectUrl,
            requireAcknowledgment: "true",
            deliveryMode: "SIM",
            eventData: { version: "restv2.1", format: "json" },
            events: ["envelope-completed", "envelope-declined", "envelope-voided"],
            ...(env("DOCUSIGN_CONNECT_HMAC_KEY") ? { includeHMAC: "true" } : {}),
          },
        }
      : {}),
  };
  const res = await api<{ envelopeId: string }>(c, "/envelopes", { method: "POST", body: JSON.stringify(body) });
  return res.envelopeId;
}

export async function recipientStatuses(c: DocuSignConfig, envelopeId: string) {
  const res = await api<{ signers: { recipientId: string; status: string }[] }>(c, `/envelopes/${envelopeId}/recipients`);
  return res.signers;
}

export async function envelopeStatus(c: DocuSignConfig, envelopeId: string): Promise<string> {
  const res = await api<{ status: string }>(c, `/envelopes/${envelopeId}`);
  return res.status;
}

export async function recipientViewUrl(c: DocuSignConfig, envelopeId: string, signer: Signer, returnUrl: string, origin: string) {
  const res = await api<{ url: string }>(c, `/envelopes/${envelopeId}/views/recipient`, {
    method: "POST",
    body: JSON.stringify({
      returnUrl,
      authenticationMethod: "none",
      userName: signer.name,
      email: signer.email,
      clientUserId: signer.clientUserId,
      recipientId: signer.recipientId,
      // Focused View (iframe) requirements:
      frameAncestors: [origin, "https://apps-d.docusign.com"],
      messageOrigins: ["https://apps-d.docusign.com"],
    }),
  });
  return res.url;
}

function encodeBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
