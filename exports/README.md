# exports/

Local ops files (gitignored `*.csv` / `*.xlsx`).

## stand_email_updates.csv

Collection Schedule–preferred stand → email list for
`scripts/sync-partner-emails-from-csv.mjs` (see `docs/partner-email-sync.md`).

- Columns: `stand_number,email,name,source_sheet`
- Target Staging first: `https://lakecity-standledger-staging-38585394.dev.odoo.com`
- Stand **1543** must be `leeroymechshub@gmail.com` (not BDO `leeroyleethawani@gmail.com`)
