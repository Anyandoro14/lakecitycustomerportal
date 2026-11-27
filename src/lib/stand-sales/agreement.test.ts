import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  blankAgreement,
  followUpReview,
  planAcknowledge,
  planCountersigned,
  planDispatch,
  planOriginalReceived,
  rejectDocuSign,
} from "../../../supabase/functions/_shared/stand-sales-agreement.ts";
import { OUTBOX_STATUS, renderStandSalesEmail, type EmailTemplate } from "../../../supabase/functions/_shared/stand-sales-email.ts";
import * as edgeOffice from "../../../supabase/functions/_shared/stand-sales-office.ts";
import { outboxInsert } from "../../../supabase/functions/_shared/stand-sales-store.ts";
import {
  acknowledgeAndRequestAgreement,
  agreementsForStaff,
  validateOffer,
  type SalesApplication,
  type SalesStore,
} from "../../../supabase/functions/_shared/stand-sales-service.ts";
import * as appOffice from "@/lib/stand-sales/office";

const now = "2026-11-27T12:00:00.000Z";
const witnesses = [
  { name: "Rudo Ncube", idNumber: "63123456A12" },
  { name: "Tendai Dube", idNumber: "75987654B00" },
];
const courierInput = {
  accepted: true,
  executionMethod: "courier",
  domiciliumAddress: "14 Josiah Tongogara, Harare",
  witnesses,
  courier: {
    recipientName: "Tariro Moyo",
    phone: "+263771234567",
    address: "14 Josiah Tongogara",
    city: "Harare",
    country: "Zimbabwe",
    region: "domestic",
  },
};

function paidApp(agreement = blankAgreement()): SalesApplication {
  return {
    id: "app-1",
    standNumber: "3076",
    standInventoryId: "inv-1",
    fullName: "Tariro Moyo",
    email: "tariro@example.com",
    phone: "+263771234567",
    stage: "paid",
    offer: { accepted: true },
    paidAt: now,
    paymentReference: "LC3076-ABCDEFGH",
    paymentAmountCents: 225000,
    portalUserId: null,
    accessTokenHash: "hash",
    agreement,
  };
}

describe("reservation validation stays independent of the Reserve label", () => {
  it("still requires the typed name to match the purchaser", () => {
    expect(validateOffer({
      idNumber: "AB123456",
      address: "14 Josiah Tongogara",
      nextOfKin: "Ana Moyo",
      signature: "tariro moyo",
      accepted: true,
    }, "Tariro Moyo")).toEqual({});
    const mismatch = validateOffer({
      idNumber: "AB123456",
      address: "14 Josiah Tongogara",
      nextOfKin: "Ana Moyo",
      signature: "Someone Else",
      accepted: true,
    }, "Tariro Moyo");
    expect(mismatch.signature).toBeTruthy();
    expect(validateOffer({
      idNumber: "AB123456",
      address: "14 Josiah Tongogara",
      nextOfKin: "Ana Moyo",
      signature: "Tariro Moyo",
      accepted: false,
    }, "Tariro Moyo").accepted).toBeTruthy();
  });
});

describe("office config", () => {
  it("keeps the app and edge copies identical and hides unverified hours", () => {
    expect(appOffice.HARE_OFFICE_ADDRESS).toBe(edgeOffice.HARE_OFFICE_ADDRESS);
    expect(appOffice.HARE_OFFICE_ADDRESS).toBe("128 Domboshava Road, Borrowdale, Harare");
    expect(appOffice.STAFF_AGREEMENT_NOTIFY_EMAIL).toBe(edgeOffice.STAFF_AGREEMENT_NOTIFY_EMAIL);
    expect(appOffice.STAFF_AGREEMENT_NOTIFY_EMAIL).toBe("accounts@lakecity.co.zw");
    expect(appOffice.HARE_OFFICE_HOURS_CONFIRMED).toBe(false);
    expect(appOffice.inPersonSigningLine()).toBe(edgeOffice.inPersonSigningLine());
    expect(appOffice.inPersonSigningLine()).toContain(appOffice.HARE_OFFICE_ADDRESS);
    expect(appOffice.inPersonSigningLine()).not.toContain(appOffice.HARE_OFFICE_HOURS);
    expect(appOffice.AGREEMENT_REVIEW_DOCUMENT_LABEL).toMatch(/placeholder/i);
  });
});

describe("agreement state machine", () => {
  it("allows the wet-signature path and rejects illegal jumps", () => {
    const acknowledged = planAcknowledge(blankAgreement(), courierInput, now, false);
    expect(acknowledged.state.status).toBe("acknowledged");
    expect(acknowledged.wizardStatus).toBe("awaiting_agreement");
    expect(() => planCountersigned(acknowledged.state, now)).toThrowError(expect.objectContaining({ code: "illegal_transition" }));
    expect(() => planDispatch(blankAgreement(), "TRACK1234", now)).toThrowError(expect.objectContaining({ code: "illegal_transition" }));

    const dispatched = planDispatch(acknowledged.state, "TRACK1234", "2026-11-01T00:00:00.000Z");
    expect(dispatched.wizardStatus).toBe("agreement_sent_wet_signature");
    expect(followUpReview(dispatched.state, Date.parse("2026-11-14T00:00:00.000Z"))?.due).toBe(false);
    expect(followUpReview(dispatched.state, Date.parse("2026-11-15T00:00:00.000Z"))).toMatchObject({ due: true, limitDays: 14 });

    const abroad = planAcknowledge(blankAgreement(), {
      ...courierInput,
      courier: { ...courierInput.courier, country: "United Kingdom", city: "London", region: "diaspora" },
    }, now, false);
    const abroadSent = planDispatch(abroad.state, "TRACK9999", "2026-10-01T00:00:00.000Z");
    expect(followUpReview(abroadSent.state, Date.parse("2026-10-28T00:00:00.000Z"))?.due).toBe(false);
    expect(followUpReview(abroadSent.state, Date.parse("2026-10-29T00:00:00.000Z"))?.limitDays).toBe(28);

    const received = planOriginalReceived(dispatched.state, now);
    expect(received.wizardStatus).toBe("signed_original_received");
    const done = planCountersigned(received.state, now);
    expect(done.state.status).toBe("countersigned");
    expect(done.wizardStatus).toBe("signed");
    expect(() => planDispatch(done.state, "TRACK1234", now)).toThrowError(expect.objectContaining({ code: "illegal_transition" }));
  });

  it("lets an in-person buyer skip courier dispatch", () => {
    const acknowledged = planAcknowledge(blankAgreement(), {
      accepted: true,
      executionMethod: "in_person",
      domiciliumAddress: "14 Josiah Tongogara, Harare",
      witnesses,
    }, now, false);
    expect(acknowledged.state.region).toBe("domestic");
    expect(() => planDispatch(acknowledged.state, "TRACK1234", now)).toThrowError(expect.objectContaining({ code: "illegal_transition" }));
    expect(planOriginalReceived(acknowledged.state, now).wizardStatus).toBe("signed_original_received");
  });

  it("rejects DocuSign actions while the flag is off and does not open an envelope when it is on", () => {
    expect(() => rejectDocuSign(false)).toThrowError(expect.objectContaining({ code: "docusign_disabled" }));
    expect(() => rejectDocuSign(true)).toThrowError(expect.objectContaining({ code: "docusign_not_configured" }));
    expect(() => planAcknowledge(blankAgreement(), { ...courierInput, executionMethod: "docusign" }, now, false)).toThrowError(expect.objectContaining({ code: "docusign_disabled" }));
    expect(() => planAcknowledge(blankAgreement(), { ...courierInput, executionMethod: "docusign" }, now, true)).toThrowError(expect.objectContaining({ code: "docusign_not_configured" }));
  });
});

describe("agreement emails stay queued", () => {
  const templates: EmailTemplate[] = [
    "agreement_acknowledged",
    "agreement_sent_wet_signature",
    "agreement_return_submitted",
    "agreement_original_received",
    "agreement_countersigned_complete",
    "agreement_action_required",
    "staff_agreement_dispatch_needed",
    "staff_return_tracking_submitted",
  ];

  it("renders every new template for the outbox and never as a live send", () => {
    for (const template of templates) {
      const to = template.startsWith("staff_") ? appOffice.STAFF_AGREEMENT_NOTIFY_EMAIL : "tariro@example.com";
      const email = renderStandSalesEmail({
        template,
        to,
        standNumber: "3076",
        fullName: "Tariro Moyo",
        tracking: "TRACK1234",
        courierName: "DHL",
        actionMessage: "Please check the witness names.",
        executionMethod: "in_person",
      });
      expect(email.to).toBe(to);
      expect(email.html).toContain("queued for preview");
      expect(email.html).toContain("3076");
      expect(email.html).not.toContain("api.resend.com");
    }
    expect(OUTBOX_STATUS).toBe("queued_dev_only");
    expect(outboxInsert({
      application_id: "app-1",
      template: "agreement_acknowledged",
      to_email: "tariro@example.com",
      subject: "Agreement",
      html: "<p>preview</p>",
    }).status).toBe("queued_dev_only");
  });

  it("queues the buyer and the accounts inbox only", async () => {
    const queued: Array<{ template: string; to: string }> = [];
    const store = {
      saveAgreement: async () => undefined,
      queueEmail: async (_id: string, template: string, to: string) => {
        queued.push({ template, to });
      },
    } as unknown as SalesStore;
    await acknowledgeAndRequestAgreement(store, paidApp(), courierInput, { docusignEnabled: false, now });
    expect(queued.map((row) => row.template)).toEqual(["agreement_acknowledged", "staff_agreement_dispatch_needed"]);
    expect(queued[0].to).toBe("tariro@example.com");
    expect(queued[1].to).toBe("accounts@lakecity.co.zw");
    await expect(acknowledgeAndRequestAgreement(store, { ...paidApp(), stage: "offer" }, courierInput, { docusignEnabled: false, now })).rejects.toMatchObject({ code: "not_paid" });
    await expect(acknowledgeAndRequestAgreement(store, paidApp(), { ...courierInput, executionMethod: "docusign" }, { docusignEnabled: false, now })).rejects.toMatchObject({ code: "docusign_disabled" });
    await expect(agreementsForStaff({ isStaff: async () => false } as unknown as SalesStore, "staff-1")).rejects.toMatchObject({ code: "not_staff" });
  });
});

describe("agreement migration shape", () => {
  it("only adds wizard statuses and leaves the email outbox check alone", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
    const sql = readFileSync(path.join(root, "supabase/migrations/20261127180100_stand_sales_agreement.sql"), "utf8");
    for (const status of ["available", "paid", "signed", "awaiting_agreement", "agreement_sent_wet_signature", "signed_original_received"]) {
      expect(sql).toContain(`'${status}'`);
    }
    expect(sql).not.toContain("stand_sales_email_status_check");
    expect(sql).not.toContain("stand_sales_stage_check");
    expect(sql).toContain("agreement_status = 'pending_review'");
  });
});
