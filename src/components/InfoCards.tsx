import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface InfoCardsProps {
  standNumber: string;
  standBalance: string;
  lastPayment: string;
  nextPayment: string;
  allStands: any[];
  onStandChange: (stand: any) => void;
}

const InfoCards = ({ 
  standNumber, 
  standBalance, 
  lastPayment, 
  nextPayment,
  allStands,
  onStandChange 
}: InfoCardsProps) => {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card className="p-4 shadow-sm">
        {allStands.length > 1 ? (
          <Select 
            value={standNumber} 
            onValueChange={(value) => {
              const stand = allStands.find(s => s.standNumber === value);
              if (stand) onStandChange(stand);
            }}
          >
            <SelectTrigger className="bg-primary text-primary-foreground border-0 mb-3 h-auto">
              <div className="text-left w-full py-1">
                <div className="text-[10px] uppercase tracking-wide mb-1">Stand Number</div>
                <div className="text-lg font-bold">
                  <SelectValue />
                </div>
              </div>
            </SelectTrigger>
            <SelectContent>
              {allStands.map((stand) => (
                <SelectItem key={stand.standNumber} value={stand.standNumber}>
                  Stand Number {stand.standNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="bg-primary text-primary-foreground rounded-lg px-3 py-2 mb-3 inline-block">
            <div className="text-[10px] uppercase tracking-wide mb-1">Stand Number</div>
            <div className="text-lg font-bold">{standNumber}</div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Current Balance</p>
        <p className="text-base font-bold text-foreground">{standBalance}</p>
      </Card>

      <Card className="p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-3">Last Payment</h3>
        <p className="text-base font-bold text-foreground">{lastPayment}</p>
        <p className="text-xs text-muted-foreground mt-2">Next Payment</p>
        <p className="text-base font-bold text-foreground">{nextPayment}</p>
      </Card>
    </div>
  );
};

export default InfoCards;
