import { Button } from "@/components/ui/button";
import { Download, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const CustomerUpdate = () => {
  const navigate = useNavigate();

  const handleExportPDF = () => {
    window.print();
  };

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-content { 
            max-width: 100% !important; 
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>

      <div className="no-print fixed top-4 left-4 right-4 z-50 flex justify-between">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <Button size="sm" onClick={handleExportPDF}>
          <Download className="h-4 w-4 mr-2" /> Export PDF
        </Button>
      </div>

      <div className="print-content max-w-2xl mx-auto px-6 py-20 text-foreground bg-background min-h-screen">
        {/* Header */}
        <div className="mb-10 text-center">
          <img src="/lakecity-logo.svg" alt="LakeCity" className="h-10 mx-auto mb-4" />
          <h1 className="text-2xl font-bold tracking-tight">LakeCity Customer Portal</h1>
          <p className="text-muted-foreground text-sm mt-1">Your Guide &amp; Latest Updates</p>
        </div>

        {/* Section 1: Platform Overview */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold border-b pb-2 mb-4">How Your Portal Works</h2>

          <p className="text-sm leading-relaxed mb-4">
            The LakeCity Customer Portal gives you 24/7 access to everything related to your stand purchase. Here's what you can do:
          </p>

          <div className="space-y-4 text-sm">
            <div>
              <h3 className="font-semibold">📊 Real-Time Dashboard</h3>
              <p className="text-muted-foreground">
                See your current balance, total amount paid, next payment due date, and account status at a glance. Your dashboard updates automatically as payments are processed.
              </p>
            </div>

            <div>
              <h3 className="font-semibold">💳 Payment History</h3>
              <p className="text-muted-foreground">
                A complete record of every payment made, including your initial deposit and all monthly instalments. Each entry shows the date, amount, and payment reference.
              </p>
            </div>

            <div>
              <h3 className="font-semibold">📄 Monthly Statements</h3>
              <p className="text-muted-foreground">
                Statements are generated at the end of each month and become available in the first week of the following month. Each statement shows your opening balance, payments received during that month, and closing balance. You can view and download any previous month's statement at any time.
              </p>
            </div>

            <div>
              <h3 className="font-semibold">📁 Document Centre</h3>
              <p className="text-muted-foreground">
                View and download your Agreement of Sale, including its signature status from both parties.
              </p>
            </div>

            <div>
              <h3 className="font-semibold">🔒 Secure Access</h3>
              <p className="text-muted-foreground">
                Your account is protected with two-factor authentication (2FA) via SMS. Only you can access your financial information.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: System Update */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold border-b pb-2 mb-4">System Update — February 2026</h2>

          <p className="text-sm leading-relaxed mb-4">
            Thank you to everyone who reached out with questions about their account details — we heard you, and we're grateful for the feedback. Based on what you told us, we've made meaningful improvements to how your account information is calculated and displayed. Here's what's new:
          </p>

          <div className="space-y-4 text-sm">
            <div>
              <h3 className="font-semibold">✅ Deposit Now Included in Payment History</h3>
              <p className="text-muted-foreground">
                Your initial deposit is now displayed as the first entry in your payment history. Previously it was reflected in your balance but not shown as a line item — this has been corrected for full transparency.
              </p>
            </div>

            <div>
              <h3 className="font-semibold">✅ More Accurate "Next Due Date"</h3>
              <p className="text-muted-foreground">
                The system now correctly counts your deposit as the first payment in your instalment sequence. This means your "Next Payment Due" date is now calculated more accurately, reflecting the true number of payments made.
              </p>
            </div>

            <div>
              <h3 className="font-semibold">✅ Overdue Status Corrected</h3>
              <p className="text-muted-foreground">
                Some accounts were incorrectly shown as "Past Due" because the deposit wasn't being counted in the payment sequence. If your account was affected, you'll now see the correct "Up to Date" status.
              </p>
            </div>
          </div>
        </section>

        {/* Reassurance */}
        <section className="mb-10 bg-muted/50 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-2">What hasn't changed</h3>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Your total amount paid remains the same</li>
            <li>Your current balance is unchanged</li>
            <li>All previously generated statements are unaffected</li>
            <li>Your Agreement of Sale and documents are unchanged</li>
          </ul>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-muted-foreground border-t pt-4">
          <p>LakeCity Residential Estates &bull; Customer Portal</p>
          <p className="mt-1">If you have questions, please submit a support request through your portal.</p>
        </footer>
      </div>
    </>
  );
};

export default CustomerUpdate;
