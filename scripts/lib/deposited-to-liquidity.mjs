/**
 * Map Google Form "Deposited to:" labels → LakeCity COA liquidity accounts.
 *
 * Labels must match the Form dropdown exactly (case-insensitive after trim).
 * Account matching prefers exact name, then fuzzy tokens for CABS USD / ZiG.
 */
export const DEPOSITED_TO_LABELS = Object.freeze([
  "Cash",
  "Cabs",
  "Cabs Zig",
  "Jumpstart",
  "Ecocash",
]);

/** Preferred COA code + exact account name (from lakecity_chart_of_accounts.xml). */
export const DEPOSITED_TO_COA = Object.freeze({
  Cash: { code: "101416", name: "Cash", match: "exact" },
  Cabs: {
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
  // Common aliases from sheet headers / typos
  if (lower === "cabs zig" || lower === "cabs zig." || lower === "cabs zi g") return "Cabs Zig";
  if (lower === "eco cash" || lower === "eco-cash") return "Ecocash";
  if (lower === "jump start") return "Jumpstart";
  return "";
}

/**
 * Resolve deposited_to → { label, code, name, match } or null when unknown/empty.
 */
export function resolveDepositedToLiquidity(raw) {
  const label = normalizeDepositedToLabel(raw);
  if (!label) return null;
  const coa = DEPOSITED_TO_COA[label];
  if (!coa) return null;
  return { label, code: coa.code, name: coa.name, match: coa.match, tokens: coa.tokens || [] };
}

/**
 * Score an account name against a deposited_to mapping (for fuzzy CABS picks).
 * Higher is better; exact name match wins.
 */
export function scoreAccountNameForDepositedTo(accountName, mapping) {
  if (!mapping) return -1;
  const name = String(accountName || "").trim();
  if (!name) return -1;
  if (name === mapping.name) return 1000;
  if (mapping.match === "exact") {
    return name.toLowerCase() === mapping.name.toLowerCase() ? 900 : -1;
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
 */
export function pickLiquidityAccount(accounts, depositedToRaw) {
  const mapping = resolveDepositedToLiquidity(depositedToRaw);
  if (!mapping) return null;
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
