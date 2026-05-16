/**
 * BDO stands whose monthly due date falls on the 10th instead of the default 5th.
 * These are all in the "BDO" customer category on the Collection Schedule.
 */
const BDO_DAY10_STANDS: ReadonlySet<string> = new Set([
  // Batch 1
  "824", "832", "1321", "1322", "1385",
  "1500", "1504", "1505", "1506", "1507", "1508", "1510", "1512",
  "1513", "1514", "1515", "1516", "1517", "1519", "1520", "1522",
  "1524", "1525", "1526", "1527", "1528", "1529", "1530", "1531",
  "1532", "1533", "1534", "1536", "1537", "1538", "1540", "1541",
  "1542", "1543", "1544", "1546", "1549", "1560", "1561",
  // Batch 2
  "1573", "1736", "1737", "1739", "1740", "1741", "1742", "1743",
  "1744", "1745", "1746", "1747", "1748", "1749", "1750", "1751",
  "1752", "1753", "1754", "1755", "1758", "1762", "1766", "1767",
  "1770", "1771", "1772", "1775", "1777", "1783", "1784",
  "3189", "3221", "3238",
]);

/**
 * Returns the day-of-month on which a stand's payment is due.
 * BDO stands → 10th; everything else → 5th.
 *
 * @param standNumber  The stand number (string)
 * @param customerCategory  The customer category from Column F (e.g. "BDO")
 */
export function getDueDay(standNumber: string, customerCategory: string): number {
  const stand = standNumber?.toString().trim();
  const cat = (customerCategory ?? "").trim().toUpperCase();
  if (cat.includes("BDO") && BDO_DAY10_STANDS.has(stand)) {
    return 10;
  }
  return 5;
}
