import CustomerHeader from "@/components/CustomerHeader";
import CustomerOverview from "@/components/CustomerOverview";
import InfoCards from "@/components/InfoCards";
import PaymentSummary from "@/components/PaymentSummary";
import DocumentsSection from "@/components/DocumentsSection";
import BottomNav from "@/components/BottomNav";

const Index = () => {
  // Mock data - will be replaced with Google Sheets integration
  const customerData = {
    customerId: "00E9557",
    customerName: "LakeCity Authenticated",
    standNumber: "A-123",
    standBalance: "$32.00",
    lastPayment: "$368.23",
    nextPayment: "$368 LESS",
    currentBalance: "$8,450.00",
    lastDueDate: "Dec 15, 2024",
    monthlyPayment: "$368.23",
    nextDueDate: "Jan 15",
    documents: {
      agreementOfSale: "/docs/agreement.pdf",
      monthlyStatement: "/docs/statement.csv",
      paymentSchedule: "/docs/schedule.xlsx",
    },
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <CustomerHeader />
      
      <main className="max-w-md mx-auto px-4 py-5 space-y-4">
        <CustomerOverview
          customerId={customerData.customerId}
          customerName={customerData.customerName}
        />

        <InfoCards
          standNumber={customerData.standNumber}
          standBalance={customerData.standBalance}
          lastPayment={customerData.lastPayment}
          nextPayment={customerData.nextPayment}
        />

        <PaymentSummary
          currentBalance={customerData.currentBalance}
          lastDueDate={customerData.lastDueDate}
          monthlyPayment={customerData.monthlyPayment}
          nextDueDate={customerData.nextDueDate}
        />

        <DocumentsSection documents={customerData.documents} />
      </main>

      <BottomNav />
    </div>
  );
};

export default Index;
