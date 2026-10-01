/**
 * Classify Stand Sales (121000 / contract GL) vs client BNPL balance exceptions.
 * No invented account numbers — codes come from LakeCity COA constants.
 */

export const STAND_SALES = {
  journalName: "Lake City Stand Sales",
  journalCode: "STND",
  tradeReceivableCode: "121000",
  contractBalanceField: "lakecity.loan.contract.current_balance",
  matchKey: "stand_number",
};

/**
 * @param {object} args
 * @param {number|null} args.clientBalance - contract current_balance
 * @param {number|null} args.standSalesBalance - 121000 residual attributed to contract/stand
 * @param {number|null} args.masterBalance - Master List Balance Remaining
 * @param {number|null} args.clientPaid - contract total_paid
 * @param {number|null} args.masterPaid - Master Actual Total Paid / txn sum
 * @param {number} [args.tol]
 */
export function classifyStandBalanceException({
  clientBalance,
  standSalesBalance,
  masterBalance,
  clientPaid,
  masterPaid,
  tol = 1.0,
}) {
  const nearly = (a, b) => a != null && b != null && Math.abs(a - b) <= tol;
  const diff = (a, b) =>
    a != null && b != null ? Math.round((a - b) * 100) / 100 : null;

  // Primary: client (BNPL) vs Stand Sales AR
  if (clientBalance != null && standSalesBalance != null && !nearly(clientBalance, standSalesBalance)) {
    let likely_cause = "stand_sales_ar_vs_contract_balance_drift";
    if (masterPaid != null && clientPaid != null && !nearly(masterPaid, clientPaid)) {
      likely_cause = "missing_or_extra_receipt_check_date_swaps";
    } else if (masterBalance != null && nearly(masterBalance, clientBalance) && !nearly(masterBalance, standSalesBalance)) {
      likely_cause = "stand_sales_je_misallocation_or_orphan_ar";
    } else if (masterBalance != null && nearly(masterBalance, standSalesBalance) && !nearly(masterBalance, clientBalance)) {
      likely_cause = "bnpl_schedule_total_paid_wrong_check_date_swaps";
    }
    return {
      kind: "client_vs_stand_sales",
      odoo_client_balance: clientBalance,
      stand_sales_balance: standSalesBalance,
      difference: diff(standSalesBalance, clientBalance),
      master_balance: masterBalance,
      likely_cause,
    };
  }

  // Secondary: client vs Master
  if (clientBalance != null && masterBalance != null && !nearly(clientBalance, masterBalance)) {
    let likely_cause = "odoo_client_vs_master_balance";
    if (masterPaid != null && clientPaid != null && !nearly(masterPaid, clientPaid)) {
      likely_cause = "missing_receipt_or_date_swap_affecting_paid_total";
    }
    return {
      kind: "client_vs_master",
      odoo_client_balance: clientBalance,
      stand_sales_balance: standSalesBalance,
      difference: diff(clientBalance, masterBalance),
      master_balance: masterBalance,
      likely_cause,
    };
  }

  // Tertiary: Stand Sales vs Master when client matched Master but AR didn't export
  if (
    standSalesBalance != null &&
    masterBalance != null &&
    !nearly(standSalesBalance, masterBalance) &&
    (clientBalance == null || nearly(clientBalance, masterBalance))
  ) {
    return {
      kind: "stand_sales_vs_master",
      odoo_client_balance: clientBalance,
      stand_sales_balance: standSalesBalance,
      difference: diff(standSalesBalance, masterBalance),
      master_balance: masterBalance,
      likely_cause: "stand_sales_je_vs_master_check_cutover_or_misallocation",
    };
  }

  return null;
}
