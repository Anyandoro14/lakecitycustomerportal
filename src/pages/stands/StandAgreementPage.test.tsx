import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StandAgreementPage from "@/pages/stands/StandAgreementPage";
import { standSalesApi } from "@/lib/stand-sales/api";
import { HARE_OFFICE_HOURS } from "@/lib/stand-sales/office";
import { saveStandSession } from "@/lib/stand-sales/session";

vi.mock("@/lib/stand-sales/api", () => ({
  standSalesApi: {
    get: vi.fn(),
    getForPortal: vi.fn(),
    acknowledgeAgreement: vi.fn(),
    submitBuyerReturn: vi.fn(),
  },
}));

const paid = {
  id: "app-1",
  standNumber: "3076",
  fullName: "Tariro Moyo",
  email: "tariro@example.com",
  phone: "+263771234567",
  stage: "paid" as const,
  offer: null,
  paidAt: "2026-11-27T12:00:00.000Z",
  paymentReference: "LC3076-ABCDEFGH",
  paymentAmountCents: 225000,
  portalReady: false,
  agreementStatus: "pending_review" as const,
  documentUrl: "https://example.invalid/agreement-of-sale-placeholder",
  documentLabel: "Agreement of Sale (placeholder for review)",
  inPersonLine: "Sign in person at the LakeCity Harare office at 128 Domboshava Road, Borrowdale, Harare",
};

describe("agreement review page", () => {
  beforeEach(() => {
    sessionStorage.clear();
    saveStandSession({ applicationId: "app-1", accessToken: "token", standNumber: "3076" });
    vi.mocked(standSalesApi.get).mockResolvedValue({ application: paid });
  });

  it("shows the placeholder and courier or in-person choice without DocuSign or unverified hours", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/stands/3076/agreement"]}>
        <Routes>
          <Route path="/stands/:standNumber/agreement" element={<StandAgreementPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId("agreement-review")).toHaveTextContent("placeholder");
    expect(screen.getByTestId("return-destination")).toHaveTextContent("Chigwanda Legal Practitioners, No. 49 The Chase, Mount Pleasant, Harare");
    expect(screen.getByText("Courier the pack to me")).toBeInTheDocument();
    expect(screen.getByText("Sign in person")).toBeInTheDocument();
    await user.click(screen.getByText("Sign in person"));
    expect(screen.getByTestId("in-person-choice")).toHaveTextContent("128 Domboshava Road, Borrowdale, Harare");
    expect(screen.getByTestId("agreement-page").textContent).not.toContain(HARE_OFFICE_HOURS);
    expect(screen.queryByTestId("docusign-unavailable")).not.toBeInTheDocument();
    expect(screen.getByTestId("agreement-page").textContent).not.toMatch(/docusign/i);
  });
});
