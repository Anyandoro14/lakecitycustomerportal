import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PortalShell from "@/components/PortalShell";
import PrivacyAnalytics from "@/pages/PrivacyAnalytics";
import {
  ANALYTICS_OPT_OUT_FLAG,
  isAnalyticsOptedOut,
  writeAnalyticsOptOutFlag,
} from "@/lib/telemetry";

vi.mock("posthog-js", () => {
  const posthog = {
    init: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    stopSessionRecording: vi.fn(),
    opt_out_capturing: vi.fn(),
    opt_in_capturing: vi.fn(),
    get_distinct_id: vi.fn(() => "anon"),
    config: { disable_session_recording: true },
  };
  return { default: posthog };
});

import posthog from "posthog-js";

const memoryStore = (() => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
})();

function renderPortalAt(path: string, page: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PortalShell>
        <Routes>
          <Route path="/login" element={page} />
          <Route path="/index" element={page} />
          <Route path="/privacy-analytics" element={<PrivacyAnalytics />} />
        </Routes>
      </PortalShell>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: memoryStore,
  });
  memoryStore.clear();
  writeAnalyticsOptOutFlag(false);
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  memoryStore.clear();
});

describe("Portal footer Privacy & analytics", () => {
  it("renders the Privacy & analytics link on the login page", () => {
    renderPortalAt(
      "/login",
      <div>
        <h1>Sign in to your LakeCity account</h1>
      </div>,
    );
    expect(screen.getByText(/Sign in to your LakeCity account/i)).toBeInTheDocument();
    expect(screen.getByTestId("portal-footer")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /privacy & analytics/i }),
    ).toHaveAttribute("href", "/privacy-analytics");
  });

  it("renders the Privacy & analytics link on a signed-in page", () => {
    renderPortalAt(
      "/index",
      <div>
        <h1>My account</h1>
      </div>,
    );
    expect(screen.getByText(/My account/i)).toBeInTheDocument();
    expect(screen.getByTestId("portal-footer")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /privacy & analytics/i }),
    ).toBeInTheDocument();
  });

  it("opts out when Turn off analytics is switched on", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/privacy-analytics"]}>
        <PortalShell>
          <Routes>
            <Route path="/privacy-analytics" element={<PrivacyAnalytics />} />
          </Routes>
        </PortalShell>
      </MemoryRouter>,
    );

    expect(isAnalyticsOptedOut()).toBe(false);
    expect(screen.getByTestId("analytics-status")).toHaveTextContent(
      /Analytics is on on this device/i,
    );
    const toggle = screen.getByRole("switch", { name: /turn off analytics/i });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await user.click(toggle);

    expect(isAnalyticsOptedOut()).toBe(true);
    expect(memoryStore.getItem(ANALYTICS_OPT_OUT_FLAG)).toBe("1");
    expect(posthog.opt_out_capturing).toHaveBeenCalled();
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).toHaveAttribute("data-state", "checked");
    expect(screen.getByTestId("analytics-status")).toHaveTextContent(
      /Analytics is off on this device/i,
    );
  });

  it("shows the switch checked when the opt-out flag is already set", () => {
    writeAnalyticsOptOutFlag(true);
    render(
      <MemoryRouter initialEntries={["/privacy-analytics"]}>
        <PortalShell>
          <Routes>
            <Route path="/privacy-analytics" element={<PrivacyAnalytics />} />
          </Routes>
        </PortalShell>
      </MemoryRouter>,
    );

    const toggle = screen.getByRole("switch", { name: /turn off analytics/i });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(toggle).toHaveAttribute("data-state", "checked");
    expect(screen.getByTestId("analytics-status")).toHaveTextContent(
      /Analytics is off on this device/i,
    );
  });
});
