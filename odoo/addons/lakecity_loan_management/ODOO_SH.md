# Odoo.sh setup (Odoo 19)

This addon is built for Odoo 19 and deploys normally on Odoo.sh.

## 1) Addon path

Ensure this repo path is available in your Odoo.sh build:

- `odoo/addons/lakecity_loan_management`

## 2) Install module

1. Update Apps List.
2. Install **Lakecity BNPL Loan Management**.

## 3) Configure API token

Set Odoo system parameter:

- `lakecity_loan.api_token=<strong_random_secret>`

This token is required by all `/lakecity/api/v1/*` endpoints.

## 4) Network/security

- Keep Odoo.sh URL in Supabase Vault as `odoo_url_<tenant_id>`.
- Keep API token in Supabase Vault as `odoo_loan_api_token_<tenant_id>`.
- Use HTTPS only.
