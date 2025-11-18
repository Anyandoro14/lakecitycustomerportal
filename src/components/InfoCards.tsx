import { Card } from "@/components/ui/card";

interface InfoCardsProps {
  standNumber: string;
  standBalance: string;
  lastPayment: string;
  nextPayment: string;
}

const InfoCards = ({ standNumber, standBalance, lastPayment, nextPayment }: InfoCardsProps) => {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card className="p-4 shadow-sm">
        <div className="bg-primary text-primary-foreground rounded-lg px-3 py-2 mb-3 inline-block">
          <div className="text-lg font-bold">{standNumber}</div>
          <div className="text-[10px] uppercase tracking-wide">VERIFIED</div>
        </div>
        <p className="text-xs text-muted-foreground">Current Balance</p>
        <p className="text-base font-bold text-foreground">{standBalance}</p>
      </Card>

      <Card className="p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">Last Payment</h3>
        <div className="bg-muted/50 rounded-lg h-8 mb-2"></div>
        <p className="text-xs text-muted-foreground">Next Payment</p>
        <p className="text-base font-bold text-foreground">{nextPayment}</p>
      </Card>
    </div>
  );
};

export default InfoCards;
