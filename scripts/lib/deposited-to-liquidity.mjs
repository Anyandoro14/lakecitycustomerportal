/**
 * Map Google Form "Deposited to:" labels → LakeCity COA liquidity accounts.
 *
 * Labels must match the Form dropdown exactly (case-insensitive after trim).
 * Account matching prefers exact name, then fuzzy tokens for CABS USD / ZiG.
 *
 * Entries with match === "unmapped" are recognized Form labels with no COA on
 * main yet — resolve returns them, but pick/find fail closed (no invent codes).
 */
export const DEPOSITED_TO_LABELS = Object.freeze([
  "Cash",
  "CABS USD",
  "Cabs Zig",
  "Jumpstart",
  "Ecocash",
  "CBZ USD",
  "Cabs Waltich",
  "CBZ ZIG",
  "EcoCash ZIG",
]);

/**
 * Preferred COA code + exact account name (from lakecity_chart_of_accounts.xml).
 * Historical Form labels "Cabs" / "CBZ" normalize via aliases to CABS USD / CBZ USD.
 */
export const DEPOSITED_TO_COA = Object.freeze({
  Cash: { code: "101416", name: "Cash", match: "exact" },
  "CABS USD": {
    code: "101410",
    name: "CABS - Main USD Current Account - 1129888509",
    match: "fuzzy",
    tokens: ["cabs", "usd", "current"],
  },
  "Cabs Zig": {
    code: "101411",
    name: "CABS - Main ZiG Current Account - 1003526446",
    match: "fuzzy",
    tokens: ["cabs", "zig", "current"],
  },
  Jumpstart: { code: "101418", name: "Jumpstart (CAD)", match: "exact" },
  Ecocash: { code: "101417", name: "Ecocash USD", match: "exact" },
  "CBZ USD": {
    code: "101419",
    name: "CBZ - Main USD Current Account - 27794540028",
    match: "exact",
  },
  "Cabs Waltich": {
    code: "101412",
    name: "CABS - Waltich - 975",
    match: "exact",
  },
  // TODO(blocker): no CBZ ZiG/ZWG liquidity account in chart XML or Account.xlsx.
  // Do not invent account numbers. Wire code/name when Tanaka/Alex adds COA on Staging.
  "CBZ ZIG": {
    code: null,
    name: null,
    match: "unmapped",
    blocker:
      "No CBZ ZiG/ZWG liquidity COA on main (searched chart XML + Account.xlsx). Fail-closed until account exists.",
  },
  // TODO(blocker): only Ecocash USD 101417 exists; no EcoCash ZiG/ZWG cash account.
  "EcoCash ZIG": {
    code: null,
    name: null,
    match: "unmapped",
    blocker:
      "No EcoCash ZiG/ZWG cash COA on main (only Ecocash USD 101417). Fail-closed until account exists.",
  },
});

export function normalizeDepositedToLabel(raw) {
  const s = String(raw || "")
    .trim()
    .replace(/:+$/, "")
    .replace(/\s+/g, " ");
  if (!s) return "";
  const lower = s.toLowerCase();
  for (const label of DEPOSITED_TO_LABELS) {
    if (label.toLowerCase() === lower) return label;
  }
  // Common aliases from sheet headers / typos / historical Form labels
  if (lower === "cabs" || lower === "cabs usd") return "CABS USD";
  if (lower === "cbz" || lower === "cbz usd") return "CBZ USD";
  if (lower === "cabs zig" || lower === "cabs zig." || lower === "cabs zi g") return "Cabs Zig";
  if (lower === "eco cash" || lower === "eco-cash") return "Ecocash";
  if (lower === "jump start") return "Jumpstart";
  if (
    lower === "cabs waltich" ||
    lower === "cabs - waltich" ||
    lower === "cabs-waltich" ||
    lower === "waltich" ||
    lower === "cabs waltich."
  ) {
    return "Cabs Waltich";
  }
  if (lower === "cbz zig" || lower === "cbz zi g" || lower === "cbz zwg") return "CBZ ZIG";
  if (
    lower === "ecocash zig" ||
    lower === "eco cash zig" ||
    lower === "eco-cash zig" ||
    lower === "ecocash zwg" ||
    lower === "eco cash zwg"
  ) {
    return "EcoCash ZIG";
  }
  return "";
}

/**
 * Resolve deposited_to → { label, code, name, match, ... } or null when unknown/empty.
 * Unmapped labels (CBZ ZIG / EcoCash ZIG) still resolve with code/name null.
 */
export function resolveDepositedToLiquidity(raw) {
  const label = normalizeDepositedToLabel(raw);
  if (!label) return null;
  const coa = DEPOSITED_TO_COA[label];
  if (!coa) return null;
  return {
    label,
    code: coa.code || null,
    name: coa.name || null,
    match: coa.match,
    tokens: coa.tokens || [],
    blocker: coa.blocker || null,
  };
}

/**
 * Score an account name against a deposited_to mapping (for fuzzy CABS picks).
 * Higher is better; exact name match wins. Unmapped mappings never score.
 */
export function scoreAccountNameForDepositedTo(accountName, mapping) {
  if (!mapping || mapping.match === "unmapped" || !mapping.code) return -1;
  const name = String(accountName || "").trim();
  if (!name) return -1;
  if (name === mapping.name) return 1000;
  if (mapping.match === "exact") {
    return name.toLowerCase() === String(mapping.name || "").toLowerCase() ? 900 : -1;
  }
  const hay = name.toLowerCase();
  const tokens = mapping.tokens || [];
  if (!tokens.length) return -1;
  let score = 0;
  for (const t of tokens) {
    if (!hay.includes(String(t).toLowerCase())) return -1;
    score += 100;
  }
  // Prefer Main / Current account numbers when present in preferred name
  if (mapping.code && hay.includes(mapping.code)) score += 50;
  return score;
}

/**
 * Pick best account from a list of { code, name } given deposited_to raw label.
 * Fail-closed: returns null for unknown or unmapped (no COA) labels.
 */
export function pickLiquidityAccount(accounts, depositedToRaw) {
  const mapping = resolveDepositedToLiquidity(depositedToRaw);
  if (!mapping || mapping.match === "unmapped" || !mapping.code) return null;
  const list = Array.isArray(accounts) ? accounts : [];
  // Prefer exact code when present
  const byCode = list.find((a) => String(a.code || "") === mapping.code);
  if (byCode) return { ...byCode, mapping };
  let best = null;
  let bestScore = -1;
  for (const acc of list) {
    const s = scoreAccountNameForDepositedTo(acc.name, mapping);
    if (s > bestScore) {
      bestScore = s;
      best = acc;
    }
  }
  if (!best || bestScore < 0) return null;
  return { ...best, mapping };
}
