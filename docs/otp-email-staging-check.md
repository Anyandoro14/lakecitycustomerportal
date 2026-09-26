# OTP email — Staging confirmation

As of `main` tip **Added SMS/Email 2FA picker**, portal login supports **SMS and email** OTP:

- UI: `src/pages/Login.tsx` (`OtpChannel = 'sms' | 'email'`)
- Send: `supabase/functions/send-2fa-code` (Twilio SMS / Resend email → `email_otp_codes`)
- Verify: `supabase/functions/verify-2fa-code`
- Migrations: `email_otp_codes` table (see `supabase/migrations/*otp*`)

## Staging check

1. Deploy portal + edge functions to Staging (including `send-2fa-code`, `verify-2fa-code`).
2. Confirm secrets: `RESEND_API_KEY`, Twilio Verify vars, Supabase URL/service role.
3. Profile with both phone + email: log in by stand → expect channel choice; send email code; verify.
4. Profile with email only: should send email OTP without SMS.
5. Wrong email must be rejected (destination must match profile email).

No further code required for meeting item “phone OTP → email” unless Staging reveals a deploy gap.
