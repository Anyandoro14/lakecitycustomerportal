import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PaymentPanel } from "@/components/stand-sales/PaymentPanel";

const base = {
  standNumber: "3076",
  amountCents: 225000,
  paid: false,
  busy: false,
  simulationAllowed: false,
  error: null,
  onPay: vi.fn(),
  onCheck: vi.fn(),
  onClear: vi.fn(),
};

describe("payment held message", () => {
  it("hides Clear message while a payment is held and shows it after a decline", () => {
    const { rerender } = render(
      <PaymentPanel
        {...base}
        result={{ result: "error", cardStatus: 0, title: "We need to check this payment", message: "Please don't pay again." }}
      />,
    );
    expect(screen.queryByTestId("clear-message")).not.toBeInTheDocument();
    expect(screen.getByTestId("pay-by-card")).toBeDisabled();

    rerender(
      <PaymentPanel
        {...base}
        result={{ result: "declined", cardStatus: 4, title: "Payment declined", message: "No money was taken." }}
      />,
    );
    expect(screen.getByTestId("clear-message")).toBeInTheDocument();
  });

  it("surfaces a second charge and keeps Clear message hidden", () => {
    render(
      <PaymentPanel
        {...base}
        paid
        result={{
          result: "second_charge",
          cardStatus: 0,
          title: "A second charge needs a refund",
          message: "Your stand is already paid, and the bank approved another charge of $2,250.00 (reference LC3076-ABCDEFGH).",
        }}
      />,
    );
    expect(screen.getByText("A second charge needs a refund")).toBeInTheDocument();
    expect(screen.queryByTestId("clear-message")).not.toBeInTheDocument();
  });
});
