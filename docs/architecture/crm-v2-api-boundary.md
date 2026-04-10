# CRM V2 API Boundary

`crm-app-api` is the standalone CRM app API boundary. It is tenant-aware and gated behind the `v2_crm_app_enabled` feature flag.

## Supported actions

- `list-accounts`
- `upsert-account`
- `upsert-contact`
- `create-case`
- `list-cases`

## Data ownership

- CRM app writes to v2 tables:
  - `crm_accounts`
  - `crm_contacts`
  - `crm_cases`
  - `crm_activities` (also bridged from `crm-conversations`)
- Existing Customer Portal and support workflows remain untouched and continue to use legacy tables/functions.

## Integration points

- `crm_cases.legacy_support_case_id` links to `support_cases`.
- `crm_activity_feed_view` gives a consolidated timeline from existing `messages`/`conversations` plus support cases.
