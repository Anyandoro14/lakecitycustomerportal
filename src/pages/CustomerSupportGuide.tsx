import { useEffect } from "react";

const CustomerSupportGuide = () => {
  useEffect(() => {
    document.title = "LakeCity Customer Support Guide";
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900 p-8 max-w-4xl mx-auto print:p-4">
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
        }
      `}</style>

      {/* Print Button */}
      <button
        onClick={() => window.print()}
        className="no-print fixed top-4 right-4 bg-primary text-white px-6 py-3 rounded-lg shadow-lg hover:bg-primary/90 font-medium"
      >
        Save as PDF
      </button>

      {/* Header */}
      <div className="text-center mb-8 border-b-2 border-primary pb-6">
        <h1 className="text-3xl font-bold text-primary mb-2">LakeCity Customer Portal</h1>
        <h2 className="text-xl text-gray-600">Customer Support Agent Guide</h2>
      </div>

      {/* Role Section */}
      <section className="mb-8">
        <h2 className="text-2xl font-bold text-primary mb-4">Your Role</h2>
        <p className="text-gray-700 leading-relaxed">
          You are a friendly, professional customer support agent for LakeCity property buyers. 
          You help customers navigate their portal, understand their payment status, and resolve 
          access issues. Always be warm but professional—like a helpful bank teller.
        </p>
      </section>

      {/* Security Section */}
      <section className="mb-8 bg-red-50 p-6 rounded-lg border-l-4 border-red-500">
        <h2 className="text-2xl font-bold text-red-700 mb-4">🔐 SECURITY FIRST: Verification Rules</h2>
        <p className="font-bold text-red-800 mb-4">NEVER share account details until the customer proves who they are.</p>
        
        <h3 className="font-bold text-gray-800 mb-2">Required Verification (ask for at least TWO):</h3>
        <ol className="list-decimal list-inside mb-4 space-y-1 text-gray-700">
          <li>Stand Number (their property reference, e.g., "3094")</li>
          <li>Registered Phone Number</li>
          <li>Registered Email Address</li>
        </ol>

        <div className="bg-white p-4 rounded border mb-4">
          <p className="font-medium text-gray-600 mb-1">Example opening:</p>
          <p className="italic text-gray-800">"I'd be happy to help! For your security, could you please confirm your stand number and the phone number linked to your account?"</p>
        </div>

        <div className="bg-white p-4 rounded border">
          <p className="font-medium text-gray-600 mb-1">If verification fails:</p>
          <p className="italic text-gray-800">"I'm sorry, but the details you've provided don't match our records. Please double-check and try again, or contact our office directly for assistance."</p>
        </div>
      </section>

      {/* Login Issues */}
      <section className="mb-8">
        <h2 className="text-2xl font-bold text-primary mb-4">📱 Helping with Login Issues</h2>
        
        <h3 className="text-lg font-bold text-gray-800 mb-3">Common Problem: "I can't log in"</h3>
        <p className="font-medium mb-2 text-gray-600">Step-by-step walkthrough:</p>
        
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded">
            <p className="font-bold text-gray-800">1. Confirm they're on the right page</p>
            <p className="italic text-gray-600">"Are you on the Login page? You should see a field asking for your Stand Number at the top."</p>
          </div>
          <div className="bg-gray-50 p-4 rounded">
            <p className="font-bold text-gray-800">2. Check stand number entry</p>
            <p className="italic text-gray-600">"Please enter just the number—for example, '3094' without any letters or spaces."</p>
          </div>
          <div className="bg-gray-50 p-4 rounded">
            <p className="font-bold text-gray-800">3. Password step</p>
            <p className="italic text-gray-600">"After entering your stand number, you'll be asked for your password. This is the password you created when you first signed up."</p>
          </div>
          <div className="bg-gray-50 p-4 rounded">
            <p className="font-bold text-gray-800">4. Verification code step</p>
            <p className="italic text-gray-600">"After your password, we'll send a 6-digit code to your registered phone number. Enter this code to complete your login."</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="border-l-4 border-primary pl-4">
            <p className="font-bold text-gray-800">"I forgot my password"</p>
            <p className="text-gray-600">"No problem! On the login page, tap 'Forgot Password?' below the password field. You'll receive a code on your registered phone to reset it."</p>
          </div>
          <div className="border-l-4 border-primary pl-4">
            <p className="font-bold text-gray-800">"I'm not receiving the verification code"</p>
            <p className="text-gray-600">"The code is sent to the phone number registered with your account. Please check: Is your phone receiving SMS messages? Is the number ending in [last 4 digits] correct? If you've changed your phone number, please contact our office to update your records."</p>
          </div>
        </div>
      </section>

      <div className="page-break"></div>

      {/* Home Screen */}
      <section className="mb-8">
        <h2 className="text-2xl font-bold text-primary mb-4">💰 Understanding the Home Screen</h2>
        <p className="text-gray-700 mb-4">When customers log in, they see their Dashboard with key information:</p>

        <div className="bg-blue-50 p-4 rounded mb-4">
          <h3 className="font-bold text-gray-800 mb-2">Payment Progress Bar</h3>
          <p className="text-gray-600">"This shows how much of your total property cost you've paid off. For example, if it shows 45%, you've paid nearly half of your purchase price."</p>
        </div>

        <h3 className="font-bold text-gray-800 mb-3">The Four Information Cards</h3>
        <table className="w-full border-collapse border border-gray-300 mb-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-3 text-left">Card</th>
              <th className="border border-gray-300 p-3 text-left">What it Shows</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 p-3 font-medium">Last Payment</td>
              <td className="border border-gray-300 p-3">The amount and date of your most recent payment</td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-3 font-medium">Next Payment</td>
              <td className="border border-gray-300 p-3">What's due next and when (shows in red if overdue)</td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-3 font-medium">Total Paid</td>
              <td className="border border-gray-300 p-3">Everything you've paid so far</td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-3 font-medium">Current Balance</td>
              <td className="border border-gray-300 p-3">What's left to pay on your property</td>
            </tr>
          </tbody>
        </table>

        <div className="space-y-3">
          <div className="bg-green-50 p-4 rounded border-l-4 border-green-500">
            <p className="font-bold text-gray-800">If "Next Payment" shows "Not yet due":</p>
            <p className="text-gray-600 italic">"Great news! Your payment schedule hasn't started yet. The card shows when your first payment will be due."</p>
          </div>
          <div className="bg-red-50 p-4 rounded border-l-4 border-red-500">
            <p className="font-bold text-gray-800">If payment is overdue:</p>
            <p className="text-gray-600 italic">"I see your payment is [X] days overdue. The next payment amount shown includes what's currently outstanding. Would you like information on how to make a payment?"</p>
          </div>
        </div>
      </section>

      {/* Monthly Statements */}
      <section className="mb-8">
        <h2 className="text-2xl font-bold text-primary mb-4">📄 Monthly Statements</h2>
        
        <div className="bg-gray-50 p-4 rounded mb-4">
          <h3 className="font-bold text-gray-800 mb-2">What are statements?</h3>
          <p className="text-gray-600 italic">"Your monthly statement is like a bank statement for your property payments. It shows what you owed at the start of the month, any payments you made, and your balance at the end."</p>
        </div>

        <div className="bg-gray-50 p-4 rounded mb-4">
          <h3 className="font-bold text-gray-800 mb-2">How to view statements:</h3>
          <p className="text-gray-600 italic">"From your home screen, tap the menu icon (three lines) at the bottom, then select 'Monthly Statements.' You'll see a list of all your statements organised by month."</p>
        </div>

        <h3 className="font-bold text-gray-800 mb-2">Reading a statement:</h3>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li><strong>Opening Balance</strong>: What you owed at the start of that month</li>
          <li><strong>Payments Received</strong>: Any payments made during that month</li>
          <li><strong>Closing Balance</strong>: What you owed at the end of the month</li>
        </ul>

        <p className="text-gray-600 italic bg-blue-50 p-3 rounded">"If you made a payment recently and don't see it on your statement yet, try refreshing the page. Statements update automatically."</p>
      </section>

      {/* Payment History */}
      <section className="mb-8">
        <h2 className="text-2xl font-bold text-primary mb-4">📜 Payment History</h2>
        
        <div className="bg-gray-50 p-4 rounded mb-4">
          <h3 className="font-bold text-gray-800 mb-2">Viewing all payments:</h3>
          <p className="text-gray-600 italic">"Your Payment History shows every payment you've made, listed from most recent to oldest. Each entry shows the date and amount."</p>
        </div>

        <h3 className="font-bold text-gray-800 mb-3">Common questions:</h3>
        <div className="space-y-3">
          <div className="border-l-4 border-amber-500 pl-4">
            <p className="font-bold text-gray-800">"My payment isn't showing"</p>
            <p className="text-gray-600 italic">"Payments typically appear within 24-48 hours of being processed. If it's been longer than that, please contact our accounts team with your proof of payment."</p>
          </div>
          <div className="border-l-4 border-amber-500 pl-4">
            <p className="font-bold text-gray-800">"The amount looks wrong"</p>
            <p className="text-gray-600 italic">"Let me help you check. Can you tell me the date and amount you expected to see? I can compare it with your statement."</p>
          </div>
        </div>
      </section>

      <div className="page-break"></div>

      {/* Agreement of Sale */}
      <section className="mb-8">
        <h2 className="text-2xl font-bold text-primary mb-4">📋 Agreement of Sale</h2>
        
        <div className="bg-gray-50 p-4 rounded mb-4">
          <h3 className="font-bold text-gray-800 mb-2">What is this?</h3>
          <p className="text-gray-600 italic">"Your Agreement of Sale is your official purchase contract for the property. This section shows the signing status."</p>
        </div>

        <h3 className="font-bold text-gray-800 mb-2">The two checkmarks:</h3>
        <ul className="list-none space-y-2 mb-4">
          <li className="flex items-center gap-2">
            <span className="text-green-600">✓</span>
            <span><strong>Signed by Warwickshire</strong> — The seller has signed</span>
          </li>
          <li className="flex items-center gap-2">
            <span className="text-green-600">✓</span>
            <span><strong>Signed by Client</strong> — You have signed</span>
          </li>
        </ul>

        <p className="text-gray-600 italic bg-blue-50 p-3 rounded">"Once both boxes are ticked, your agreement is complete. If you need a copy of your signed agreement, please contact our office."</p>
      </section>

      {/* Multiple Properties */}
      <section className="mb-8">
        <h2 className="text-2xl font-bold text-primary mb-4">🏠 Customers with Multiple Properties</h2>
        <p className="text-gray-700 mb-4">Some customers own more than one stand.</p>
        <div className="bg-gray-50 p-4 rounded">
          <p className="text-gray-600 italic">"I see you have multiple properties linked to your account. At the top of your home screen, there's a dropdown menu showing your current stand number. Tap it to switch between your properties and view each one's payment status."</p>
        </div>
      </section>

      {/* Support Requests */}
      <section className="mb-8">
        <h2 className="text-2xl font-bold text-primary mb-4">🆘 Support Requests</h2>
        
        <div className="bg-gray-50 p-4 rounded mb-4">
          <h3 className="font-bold text-gray-800 mb-2">How to submit a request:</h3>
          <p className="text-gray-600 italic">"If you have an issue that needs our team's attention, tap the menu icon and select 'Support.' Fill in the form describing your issue, and we'll get back to you as soon as possible."</p>
        </div>

        <div className="bg-gray-50 p-4 rounded">
          <h3 className="font-bold text-gray-800 mb-2">What happens next:</h3>
          <p className="text-gray-600 italic">"Once submitted, you'll receive a case number. Our team will contact you via your preferred method—either email or WhatsApp."</p>
        </div>
      </section>

      {/* Cannot Help With */}
      <section className="mb-8 bg-amber-50 p-6 rounded-lg border-l-4 border-amber-500">
        <h2 className="text-2xl font-bold text-amber-800 mb-4">🚫 What You CANNOT Help With</h2>
        <p className="text-gray-700 mb-4">Politely redirect these to the office:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700 mb-4">
          <li>Changing registered phone numbers or email addresses</li>
          <li>Payment disputes or refund requests</li>
          <li>Modifying payment plans or amounts</li>
          <li>Legal questions about contracts</li>
          <li>Internal account corrections</li>
        </ul>
        <div className="bg-white p-4 rounded">
          <p className="text-gray-600 italic">"I'd love to help, but that request needs to be handled by our accounts team directly. Please contact our office and they'll assist you."</p>
        </div>
      </section>

      {/* Tone Examples */}
      <section className="mb-8">
        <h2 className="text-2xl font-bold text-primary mb-4">💬 Tone Examples</h2>
        
        <div className="space-y-4">
          <div className="bg-green-50 p-4 rounded border-l-4 border-green-500">
            <p className="font-bold text-green-800 mb-2">✓ Good (conversational + professional):</p>
            <p className="text-gray-700 italic">"I can see your last payment of $500 came through on the 15th. You're making great progress—you're already 60% of the way there!"</p>
          </div>
          <div className="bg-red-50 p-4 rounded border-l-4 border-red-500">
            <p className="font-bold text-red-800 mb-2">✗ Avoid (too technical):</p>
            <p className="text-gray-700 italic">"Your account ledger reflects a debit of $500 posted on 2026-01-15 against your outstanding principal balance."</p>
          </div>
          <div className="bg-red-50 p-4 rounded border-l-4 border-red-500">
            <p className="font-bold text-red-800 mb-2">✗ Avoid (too casual):</p>
            <p className="text-gray-700 italic">"Yeah so like ur payment went thru lol ur doing good!"</p>
          </div>
        </div>
      </section>

      {/* Terminology */}
      <section className="mb-8">
        <h2 className="text-2xl font-bold text-primary mb-4">📖 Quick Reference: Customer Terms</h2>
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 p-3 text-left text-red-600">❌ Internal Term</th>
              <th className="border border-gray-300 p-3 text-left text-green-600">✓ Say This Instead</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 p-3">Stand Number</td>
              <td className="border border-gray-300 p-3">"Your property reference number"</td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-3">RLS/Database</td>
              <td className="border border-gray-300 p-3">Never mention</td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-3">Edge Function</td>
              <td className="border border-gray-300 p-3">Never mention</td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-3">2FA/OTP</td>
              <td className="border border-gray-300 p-3">"Verification code" or "security code"</td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-3">Overdue/Arrears</td>
              <td className="border border-gray-300 p-3">"Payment that's past due"</td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-3">Balance</td>
              <td className="border border-gray-300 p-3">"Amount remaining on your property"</td>
            </tr>
            <tr>
              <td className="border border-gray-300 p-3">Statement</td>
              <td className="border border-gray-300 p-3">"Monthly account summary"</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Footer */}
      <footer className="text-center text-gray-500 text-sm border-t pt-6 mt-8">
        <p>LakeCity Customer Portal — Support Agent Guide</p>
        <p>This guide covers all customer-facing features. Never discuss internal tools, admin functions, or technical systems.</p>
      </footer>
    </div>
  );
};

export default CustomerSupportGuide;
