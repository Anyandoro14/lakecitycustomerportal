import { Card } from "@/components/ui/card";

interface CustomerOverviewProps {
  customerId: string;
  customerName: string;
}

const CustomerOverview = ({ customerId, customerName }: CustomerOverviewProps) => {
  return (
    <Card className="p-5 shadow-sm">
      <div>
        <h2 className="text-xl font-bold text-foreground mb-1">Customer Portal</h2>
        <p className="text-sm text-muted-foreground">{customerName}</p>
      </div>
    </Card>
  );
};

export default CustomerOverview;
