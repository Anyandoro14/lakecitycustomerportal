const KEY = "lakecity.standSales.session";

export interface StandSalesSession {
  applicationId: string;
  accessToken: string;
  standNumber: string;
}

export function saveStandSession(session: StandSalesSession) {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function readStandSession(): StandSalesSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StandSalesSession;
    if (!parsed.applicationId || !parsed.accessToken || !parsed.standNumber) return null;
    return parsed;
  } catch {
    return null;
  }
}
