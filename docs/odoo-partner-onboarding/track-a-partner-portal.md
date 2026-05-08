# Track A — Activate NJere's Odoo Partner Portal

Goal: NJere LLC appears as **Partner of record** on Warwickshire PVT Ltd's Odoo 19 subscription, so commission/discount applies and NJere can manage Warwickshire from `partners.odoo.com`.

## Before you start

| Item | Detail |
|---|---|
| Authorization | Confirm in writing (email is fine) that Warwickshire authorizes NJere LLC to act as their Odoo Partner of record. Save the email under `docs/odoo-partner-onboarding/.evidence/` (gitignored) or your shared drive. |
| NJere primary contact email | The email Odoo authorized — must match the partner.odoo.com login. |
| Warwickshire's Odoo subscription ID | Format `ODOO-SXXXXXXXX`. Available to Warwickshire under *Settings → Subscription* in their database, or on their renewal invoice. |
| Warwickshire admin contact | Person at Warwickshire who can log into the LakeCity DB as Settings/Admin (needed for step A3). |

## A1. Sign in / activate at partners.odoo.com

1. Go to <https://partners.odoo.com> and sign in with the NJere LLC primary contact email.
2. If first time: accept the **Partnership Agreement**, set the company legal name to `NJere LLC`, billing entity, country.
3. Confirm partner level. New partners start at **Ready**; commission tiers and customer-management permissions improve at **Silver** and **Gold** (require certifications). NJere's current minimum-viable level is **Ready** — that's enough for everything in this runbook.
4. Verify two-factor auth is enabled on the account.

Verification:
- The dashboard shows "Welcome, NJere LLC" with a partner level badge.
- The public `odoo.com/partners` listing is searchable for "NJere LLC" (or marked unlisted by your choice).

## A2. Verify and complete company profile

Navigate to *My Account → Company* and ensure:

| Field | Value |
|---|---|
| Company Name | `NJere LLC` |
| Legal Name | `NJere LLC` (whatever's on the registration cert) |
| Country | (NJere's country of incorporation) |
| VAT/Tax ID | as registered |
| Billing email | NJere's accounting inbox |
| Public email | partner-facing inbox |
| CSM (Customer Success Manager) | Note their name + email — you'll use this in A3 if Warwickshire's subscription needs to be relinked |
| Languages / Services | Tick: Implementation, Development, Functional Consulting (whatever NJere offers) |

Verification: Save, then re-open the page — the right sidebar shows the partner level, contract status, and CSM contact.

## A3. Link Warwickshire as a managed customer

This is the step that turns the relationship into commission and management rights. Two paths depending on whether Warwickshire's subscription was created with a partner or not.

### Path 1 — Warwickshire's subscription was created without a partner (most likely)

1. Warwickshire admin opens their Odoo 19 database → *Settings → Subscription*.
2. Under "Partner", they enter `NJere LLC` (search by partner ID if needed — NJere's partner ID is on the partners.odoo.com dashboard).
3. Save. Odoo emails NJere's CSM for verification; CSM relinks the subscription within 1–2 business days.

### Path 2 — Subscription already has a different (or no) partner and Path 1 won't take

1. From `partners.odoo.com`, *Help → Contact CSM* (top-right).
2. Open ticket with subject `Relink subscription <ODOO-SXXXXXXXX> (Warwickshire PVT Ltd) to NJere LLC`.
3. Body must include:
   - The signed authorization email from Warwickshire (from the "Before you start" section)
   - The exact subscription ID
   - NJere's partner ID
4. CSM relinks; expect 2–5 business days.

### After relinking

In `partners.odoo.com → Customers`:

- Warwickshire PVT Ltd appears in the list.
- Subscription status shows **Active** with NJere as Partner.
- The next renewal invoice on Warwickshire's account shows the partner discount line (typically 15% at Ready level — confirm against the current Odoo Partnership Agreement appendix; this number changes occasionally).

## A4. Pull resources NJere will use day-to-day

From `partners.odoo.com`:

- **Documentation** → bookmark the Odoo 19 release notes, especially the [Accounting](https://www.odoo.com/documentation/19.0/applications/finance/accounting.html) and [Developer/ORM](https://www.odoo.com/documentation/19.0/developer/) sections, which are the surfaces this runbook touches.
- **Lead Share dashboard** — incoming customer leads in NJere's region.
- **Learning** → Functional/Technical certification paths (required to advance to Silver/Gold, which unlocks higher commission tiers and lead-share priority).
- **Help → Contact CSM** shortcut — bookmark this; it's how you escalate everything in Tracks B and C if Odoo-side action is blocked.

## A5. Sign-off checklist

Before declaring Track A done:

- [ ] NJere can log into `partners.odoo.com` with 2FA.
- [ ] NJere LLC company profile is complete and matches legal docs.
- [ ] Warwickshire PVT Ltd appears under *Customers* with NJere as Partner.
- [ ] Warwickshire's next renewal invoice (or quote) shows the partner discount line.
- [ ] CSM contact name + email recorded in NJere's runbook of record.
- [ ] Authorization email from Warwickshire archived.

When all five boxes are ticked, move on to [Track B](./track-b-odoo-sh-and-database.md).
