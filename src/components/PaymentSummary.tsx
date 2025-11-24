import { Card } from "@/components/ui/card";
import { CheckCircle2, Circle } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PaymentSummaryProps {
  signedBySeller?: boolean;
  signedByBuyer?: boolean;
}

const PaymentSummary = ({ signedBySeller = false, signedByBuyer = false }: PaymentSummaryProps) => {
  const navigate = useNavigate();

  return (
    <Card 
      className="p-3.5 bg-primary text-primary-foreground shadow-sm cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => navigate("/agreement-of-sale")}
    >
      <h3 className="text-sm font-semibold mb-3">Agreement of Sale Status</h3>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          {signedBySeller ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
          <span>Signed by Seller</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {signedByBuyer ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
          <span>Signed by Buyer</span>
        </div>
      </div>
    </Card>
  );
};

export default PaymentSummary;
