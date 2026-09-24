# Let customers choose SMS or Email for their login code

## What changes for customers

After entering stand number and password, customers see a clear choice: **Text message** or **Email**. The code is only ever sent to the phone number or email address already saved on their account — they can never type in a different one.

- If only a phone is on file, text message is chosen automatically (destination still shown).
- If only an email is on file, email is chosen automatically.
- If two phone numbers are on file and they pick text message, the existing primary/secondary picker still appears.
- The verification screen says which way the code was sent and shows the destination partly hidden (`+263 78***83` or `a***@domain.com`).
- "Resend code" sends again the same way, to the same destination. Cooldown, the 3-resend limit, and the support bypass-code path stay exactly as they are.

Branding, mobile-first card layout, password login, and stand-number lookup are unchanged. WhatsApp is not offered.

## How it works behind the scenes

**New table `email_otp_codes`** (email, user_id, code_hash, expires_at, consumed_at, attempts). Codes are 6 digits, SHA-256 hashed with a per-row salt, valid 10 minutes, max 5 wrong tries. RLS enabled with no public policies plus service-role grant only — reachable solely from server code.

**`send-2fa-code`** gains `channel: 'sms' | 'email'`.
- Requires a signed-in-or-just-authenticated identity: the client passes the pending user id and the function loads that profile server-side.
- SMS: the supplied phone must normalize-match `profiles.phone_number` or `phone_number_2`, else rejected. Then Twilio Verify as today.
- Email: the supplied email must match `profiles.email` (case-insensitive), else rejected. Generates the code, stores the hash, sends a branded LakeCity email through the existing Resend setup. The code itself is never logged.
- Keeps returning HTTP 200 with a structured body on failure, per project standard.

**`verify-2fa-code`** gains `channel`. For `sms` it behaves exactly as today (including the admin bypass-code path). For `email` it looks up the newest unconsumed row for that address, compares hashes, marks it consumed, and increments attempts on a miss. Bypass codes remain available on the SMS path.

**`Login.tsx`** — refined, not rewritten:
- Profile read after password auth now also pulls `email`.
- New `showChannelSelection` screen with two large tap targets (phone icon / mail icon) and the masked destination under each; hidden options when not on file; auto-select when only one exists.
- `selectedChannel` widens to `'sms' | 'email'`; a `destination` value drives sending, resend, verification copy, and masking.
- New `maskEmail` helper in `src/lib/validation.ts`.

## Assumption

Twilio Verify's email channel needs a SendGrid sender configured inside the Verify service, which this project does not have, so email codes go through the project's existing Resend email setup with hashed short-lived codes.
