import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/validation";

interface PricingTilesProps {
  totalPrice: string;
  deposit: string;
  isVatInclusive?: boolean | null;
}

const PricingTiles = ({ totalPrice, deposit, isVatInclusive }: PricingTilesProps) => {
  const formattedTotalPrice = totalPrice ? formatCurrency(totalPrice) : null;
  const formattedDeposit = deposit ? formatCurrency(deposit) : null;

  // Determine VAT text
  const getVatText = () => {
    if (isVatInclusive === true) return "Inclusive of VAT";
    if (isVatInclusive === false) return "Exclusive of VAT";
    return null;
  };

  const vatText = getVatText();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {/* Total Price Tile - slightly more prominent */}
      <Card className="p-4 shadow-sm bg-card">
        <h3 className="text-xs font-semibold text-foreground mb-2">Purchase Price</h3>
        <p className="text-xl font-bold text-primary break-words leading-tight">
          {formattedTotalPrice || "—"}
        </p>
        {vatText && (
          <p className="text-xs text-muted-foreground mt-1.5">{vatText}</p>
        )}
      </Card>

      {/* Deposit Tile */}
      <Card className="p-4 shadow-sm bg-card">
        <h3 className="text-xs font-semibold text-foreground mb-2">Deposit</h3>
        <p className="text-lg font-bold text-primary break-words leading-tight">
          {formattedDeposit || "—"}
        </p>
      </Card>
    </div>
  );
};

export default PricingTiles;
