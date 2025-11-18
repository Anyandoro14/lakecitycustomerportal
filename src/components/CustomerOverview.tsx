import { Card } from "@/components/ui/card";

interface CustomerOverviewProps {
  customerId: string;
  customerName: string;
}

const CustomerOverview = ({ customerId, customerName }: CustomerOverviewProps) => {
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-foreground mb-1">Customer Portal</h2>
          <p className="text-sm text-muted-foreground">{customerName}</p>
        </div>
        <div className="bg-primary text-primary-foreground rounded-2xl px-4 py-3 text-center min-w-[100px]">
          <p className="text-lg font-bold">{customerId}</p>
          <p className="text-xs opacity-90">VERIFIED</p>
        </div>
      </div>
    </Card>
  );
};

export default CustomerOverview;
