import { render, screen } from "@testing-library/react";
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
    expect(screen.getByText("2. Reserve")).toBeInTheDocument();
    expect(screen.getByText("4. Welcome")).toBeInTheDocument();
    expect(screen.getByText("5. Portal")).toBeInTheDocument();
    expect(screen.getByText("6. Agreement")).toBeInTheDocument();
    expect(screen.queryByText(/Offer/)).not.toBeInTheDocument();
  });
});
