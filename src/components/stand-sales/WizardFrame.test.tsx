import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { STEPS, WizardFrame } from "@/components/stand-sales/WizardFrame";

describe("wizard stepper", () => {
  it("uses six steps and keeps Welcome and Portal on their current indexes", () => {
    expect(STEPS).toEqual(["Stand", "Reserve", "Pay", "Welcome", "Portal", "Agreement"]);
    render(
      <MemoryRouter>
        <WizardFrame step={5}>Agreement body</WizardFrame>
      </MemoryRouter>,
    );
    const progress = screen.getByRole("navigation", { name: "Reservation progress" });
    expect(within(progress).getByText("1. Stand")).toBeInTheDocument();
    expect(within(progress).getByText("2. Reserve")).toBeInTheDocument();
    expect(within(progress).getByText("3. Pay")).toBeInTheDocument();
    expect(within(progress).getByText("4. Welcome")).toBeInTheDocument();
    expect(within(progress).getByText("5. Portal")).toBeInTheDocument();
    expect(within(progress).getByText("6. Agreement")).toBeInTheDocument();
    expect(within(progress).getByText("6. Agreement").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.queryByText(/Offer/)).not.toBeInTheDocument();
  });
});
