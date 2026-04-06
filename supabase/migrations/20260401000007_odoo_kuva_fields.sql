-- Migration 007: Add Odoo and Kuva integration fields to existing tables

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS odoo_partner_id INTEGER;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS odoo_sync_status TEXT DEFAULT 'pending';

ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS gateway_metadata JSONB DEFAULT '{}';
