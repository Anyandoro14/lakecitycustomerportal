/**
 * Validation helpers for Collection Schedule tab names.
 *
 * Valid patterns:
 *  1. Exactly "Collection Schedule 1" (legacy Richcraft group)
 *  2. "<Group Name> - YYYY-MM-DD" where date >= 2022-01-01
 */

const LEGACY_TAB = "Collection Schedule 1";
const GROUP_TAB_RE = /^(.+?) - (\d{4}-\d{2}-\d{2})$/;
const MIN_DATE = "2022-01-01";

export interface TabParseResult {
  valid: boolean;
  groupName?: string;
  date?: string;
  error?: string;
}

export const TAB_NAME_ERROR =
  "Tab must be named: Customer Group - YYYY-MM-DD (on or after 2022-01-01) or use Collection Schedule 1 for Richcraft.";

export function parseCollectionTabName(title: string): TabParseResult {
  if (title === LEGACY_TAB) {
    return { valid: true, groupName: "Richcraft", date: undefined };
  }

  const match = title.match(GROUP_TAB_RE);
  if (!match) {
    return { valid: false, error: TAB_NAME_ERROR };
  }

  const [, groupName, date] = match;
  if (date < MIN_DATE) {
    return { valid: false, error: TAB_NAME_ERROR };
  }

  return { valid: true, groupName, date };
}

export function isValidCollectionTab(title: string): boolean {
  return parseCollectionTabName(title).valid;
}
