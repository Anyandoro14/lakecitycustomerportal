import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CustomerOverviewProps {
  customerId: string;
  customerName: string;
  standNumber: string;
  allStands: any[];
  onStandChange: (stand: any) => void;
}

const CustomerOverview = ({ customerId, customerName, standNumber, allStands, onStandChange }: CustomerOverviewProps) => {
  return (
    <Card className="p-3.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-foreground truncate">{customerName}</h2>
        </div>
        {allStands.length > 1 ? (
          <Select 
            value={standNumber} 
            onValueChange={(value) => {
              const stand = allStands.find(s => s.standNumber === value);
              if (stand) onStandChange(stand);
            }}
          >
            <SelectTrigger className="bg-primary text-primary-foreground border-0 w-auto h-auto px-3 py-1.5 shrink-0">
              <div className="text-left">
                <div className="text-[9px] uppercase tracking-wide opacity-80">Stand Number</div>
                <div className="text-base font-bold">
                  <SelectValue />
                </div>
              </div>
            </SelectTrigger>
            <SelectContent className="bg-card border-border z-50">
              {allStands.map((stand) => (
                <SelectItem key={stand.standNumber} value={stand.standNumber} className="hover:bg-accent">
                  {stand.standNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 shrink-0">
            <div className="text-[9px] uppercase tracking-wide opacity-80">Stand Number</div>
            <div className="text-base font-bold">{standNumber}</div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default CustomerOverview;
