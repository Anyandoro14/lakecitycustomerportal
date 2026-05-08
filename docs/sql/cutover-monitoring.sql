-- ============================================================================
-- cutover-monitoring.sql
-- ----------------------------------------------------------------------------
-- Daily reconciliation queries for the 7-day post-cutover monitoring window.
-- Run in the Lovable Cloud SQL editor each morning. Each query has a Pass /
-- Fail expectation in its comment.
-- ============================================================================

\echo '===== 1. Receipts created in last 24h ====='
\echo 'PASS: count > 0 on a normal weekday (matches your team activity).'
\echo 'FAIL: zero for two consecutive days = upstream broken (Kuva / staff).'
SELECT
  count(*)                                             AS total,
  count(*) FILTER (WHERE odoo_collection_payment_id IS NOT NULL) AS odoo_origin,
  count(*) FILTER (WHERE gateway = 'kuva')             AS kuva,
  count(*) FILTER (WHERE qc_status = 'approved')       AS approved,
  count(*) FILTER (WHERE qc_status = 'pending_qc')     AS pending
FROM payment_receipts
WHERE created_at >= now() - interval '24 hours';

\echo
\echo '===== 2. Odoo-origin sync status breakdown (last 24h) ====='
\echo 'PASS: most rows are odoo_sync_status=synced or pending_qc_in_odoo.'
\echo 'FAIL: high count of no_match or null = sync broken.'
SELECT
  COALESCE(odoo_sync_status, '(null)') AS sync_status,
  count(*)                              AS rows,
  sum(amount)::numeric(12,2)            AS total_amount
FROM payment_receipts
WHERE created_at >= now() - interval '24 hours'
  AND (gateway = 'odoo' OR odoo_collection_payment_id IS NOT NULL)
GROUP BY 1
ORDER BY 2 DESC;

\echo
\echo '===== 3. Receipts stuck in pending_qc > 48h ====='
\echo 'PASS: zero rows. Staff QCs every payment within 48h.'
\echo 'FAIL: rows here = QC backlog. Reach out to the team.'
SELECT
  id, stand_number, amount, payment_date, gateway,
  gateway_reference, created_at
FROM payment_receipts
WHERE qc_status = 'pending_qc'
  AND created_at < now() - interval '48 hours'
ORDER BY created_at ASC
LIMIT 20;

\echo
\echo '===== 4. odoo-sync-payment no_match rate (last 7 days) ====='
\echo 'PASS: < 5% of total. Some no_match expected for off-cycle payments.'
\echo 'FAIL: > 10% = schedule import missed stands or Day-5 constraint issue.'
SELECT
  count(*) FILTER (WHERE odoo_sync_status = 'no_match')      AS no_match,
  count(*)                                                    AS total,
  round(
    100.0 * count(*) FILTER (WHERE odoo_sync_status = 'no_match')
    / NULLIF(count(*), 0),
    1
  )                                                           AS no_match_pct
FROM payment_receipts
WHERE created_at >= now() - interval '7 days'
  AND gateway != 'odoo';

\echo
\echo '===== 5. Contracts vs Odoo schedules (cardinality check) ====='
\echo 'PASS: contracts.odoo_schedule_id NOT NULL count is non-decreasing day-over-day.'
\echo 'FAIL: drops = contracts being unlinked or rows deleted.'
SELECT
  count(*)                                                     AS total_contracts,
  count(*) FILTER (WHERE odoo_schedule_id IS NOT NULL)         AS linked_to_odoo,
  count(*) FILTER (WHERE odoo_schedule_id IS NULL)             AS unlinked
FROM contracts
WHERE status = 'active';

\echo
\echo '===== 6. Webhook idempotency check ====='
\echo 'PASS: zero rows. Idempotency unique index is doing its job.'
\echo 'FAIL: any row = the unique index is missing or broken.'
SELECT
  odoo_collection_payment_id, count(*)
FROM payment_receipts
WHERE odoo_collection_payment_id IS NOT NULL
GROUP BY 1
HAVING count(*) > 1;

\echo
\echo '===== 7. Total paid via Odoo (running) ====='
\echo 'Compare against Odoo lakecity.collection.payment sum(amount_paid).'
\echo 'PASS: matches within 0.01% (rounding).'
SELECT
  count(*) FILTER (WHERE qc_status = 'approved')               AS approved_count,
  sum(amount) FILTER (WHERE qc_status = 'approved')::numeric(14,2) AS approved_total,
  sum(amount) FILTER (WHERE qc_status = 'approved' AND odoo_collection_payment_id IS NOT NULL)::numeric(14,2)
                                                              AS approved_odoo_origin_total
FROM payment_receipts;

\echo
\echo 'Done. Review each query above for PASS/FAIL.'
