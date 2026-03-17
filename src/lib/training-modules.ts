// Training module definitions for LakeCity LMS

import loginScreen from "@/assets/guide/login-screen.png";
import internalPortalNav from "@/assets/guide/internal-portal-nav.png";
import clientVsInternalView from "@/assets/guide/client-vs-internal-view.png";
import receiptCaptureForm from "@/assets/guide/receipt-capture-form.png";
import collectionSchedule from "@/assets/guide/collection-schedule.png";
import agreementOfSale from "@/assets/guide/agreement-of-sale.png";
import homeDashboard from "@/assets/guide/home-dashboard.png";
import paymentHistory from "@/assets/guide/payment-history.png";
import internalDashboard from "@/assets/guide/internal-dashboard.png";
import updatesPage from "@/assets/guide/updates-page.png";
import reportingDashboard from "@/assets/guide/reporting-dashboard.png";
import monthlyStatements from "@/assets/guide/monthly-statements.png";
import statementSummary from "@/assets/guide/statement-summary.png";

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface ModuleSection {
  title: string;
  content: string;
  screenshotPlaceholder?: string;
  screenshotSrc?: string;
  videoPlaceholder?: string;
}

export interface TrainingModule {
  id: string;
  number: number;
  title: string;
  icon: string;
  objective: string;
  estimatedMinutes: number;
  sections: ModuleSection[];
  quiz: QuizQuestion[];
}

export const LEAD_MODULES: TrainingModule[] = [
  {
    id: "user-management",
    number: 1,
    title: "User Management & Access Control",
    icon: "🔐",
    objective: "Understand the login process, credential handling, permission levels, and the principles of segregation of duties within the LakeCity system.",
    estimatedMinutes: 25,
    sections: [
      {
        title: "Login Process & Credentials",
        content: `The LakeCity system uses a secure multi-step login process designed to protect both customer and internal data.\n\n**Customer Login Flow:**\n1. Customer enters their registered email address\n2. Password authentication is validated\n3. Two-Factor Authentication (2FA) via SMS is triggered\n4. Upon successful 2FA verification, the customer accesses their dashboard\n\n**Internal Staff Login Flow:**\n1. Staff navigates to the internal login portal\n2. Credentials are validated against the internal users directory\n3. Role-based access is automatically applied\n\n**Example:** Alex Nyandoro logs in with his registered email. The system sends a 2FA code to his verified phone number. After entering the code, Alex sees his personalized dashboard showing his stand information, payment history, and documents.`,
        screenshotPlaceholder: "Screenshot: Customer login screen with email and password fields",
        screenshotSrc: loginScreen,
      },
      {
        title: "Permission Levels & Roles",
        content: `The system enforces strict role-based access control (RBAC) with the following hierarchy:\n\n**Internal Roles:**\n- **Super Admin** — Full system access, can manage users, view all reports, and configure system settings\n- **Director** — Access to reporting, collections, and oversight functions\n- **Admin** — Operational access to CRM, customer lookups, and support tools\n- **Helpdesk** — Basic customer support access\n\n**Customer Role:**\n- Customers can only view their own data: payment history, statements, agreement of sale, and updates\n\n**Key Principle:** A customer can never see another customer's data. An admin cannot perform actions reserved for Super Admins.`,
        screenshotPlaceholder: "Screenshot: Internal portal showing role-based navigation differences",
        screenshotSrc: internalPortalNav,
      },
      {
        title: "Internal vs Client Visibility",
        content: `Understanding what each user type can see is critical for maintaining data integrity and client trust.\n\n**What Clients See:**\n- Their own payment summary and history\n- Monthly statements for their stand\n- Agreement of Sale documents\n- Company updates and announcements\n\n**What Internal Users See:**\n- All client records (based on role)\n- Collection schedules and overdue accounts\n- CRM conversations\n- Reporting dashboards\n- Audit logs\n\n**Example:** When Alex Nyandoro views his dashboard, he sees only Stand 3314 information. An internal admin viewing Alex's record can see his full payment history, communication log, and account status.`,
        screenshotPlaceholder: "Screenshot: Side-by-side comparison of client vs internal view",
        screenshotSrc: clientVsInternalView,
      },
      {
        title: "Risk & Control Principles",
        content: `**Segregation of Duties** is a fundamental internal control principle applied throughout the system:\n\n1. **Payment Entry vs. Approval** — The person who enters a receipt should not be the same person who approves it\n2. **Account Creation vs. Access Granting** — User provisioning is separate from role assignment\n3. **Data Entry vs. Reporting** — Those who input data should not be the sole reviewers of output reports\n\n**Audit Trail:** Every significant action in the system is logged with:\n- Who performed the action\n- When it was performed\n- What was changed\n- The IP address of the request\n\nThis ensures full traceability and accountability, similar to how a general ledger maintains a complete record of all financial transactions.`,
      },
    ],
    quiz: [
      {
        id: "um-q1",
        question: "What is the purpose of Two-Factor Authentication (2FA) in the customer login process?",
        options: [
          "To speed up the login process",
          "To add an additional layer of security beyond the password",
          "To verify the customer's email address",
          "To track login frequency",
        ],
        correctIndex: 1,
        explanation: "2FA adds a second verification step (SMS code) to ensure that even if a password is compromised, unauthorized access is prevented.",
      },
      {
        id: "um-q2",
        question: "Alex Nyandoro calls to say he can see another customer's payment history. What is the most likely issue?",
        options: [
          "This is normal behavior for premium customers",
          "There is a role configuration error that needs immediate investigation",
          "Alex has been granted admin access",
          "The system always shows all customer data",
        ],
        correctIndex: 1,
        explanation: "Customers should only ever see their own data. If Alex can see another customer's data, this represents a serious access control breach requiring immediate investigation.",
      },
      {
        id: "um-q3",
        question: "Which internal role has the authority to manage user accounts and configure system settings?",
        options: ["Helpdesk", "Admin", "Director", "Super Admin"],
        correctIndex: 3,
        explanation: "Only Super Admins have full system access including user management and system configuration.",
      },
      {
        id: "um-q4",
        question: "Why is segregation of duties important in the payment recording process?",
        options: [
          "It makes the process faster",
          "It prevents any single person from both entering and approving payments, reducing fraud risk",
          "It reduces the number of staff needed",
          "It is only important for external audits",
        ],
        correctIndex: 1,
        explanation: "Segregation of duties is a key internal control that prevents fraud by ensuring no single individual controls an entire transaction lifecycle.",
      },
      {
        id: "um-q5",
        question: "What information is captured in the system's audit trail?",
        options: [
          "Only the action performed",
          "The action, who performed it, when, and what changed",
          "Only the date and time",
          "Only errors and exceptions",
        ],
        correctIndex: 1,
        explanation: "The audit trail captures comprehensive information including who, what, when, and the details of changes to ensure full accountability and traceability.",
      },
    ],
  },
  {
    id: "receipt-capture",
    number: 2,
    title: "Receipt Capture & Payment Recording",
    icon: "🧾",
    objective: "Understand the receipt capture process, data fields, data flow from entry to ledger, and the accounting controls that ensure accuracy.",
    estimatedMinutes: 30,
    sections: [
      {
        title: "The Receipt Capture Form",
        content: `Payment receipts are captured through a structured Google Form that ensures consistent data collection. Each field serves a specific accounting purpose:\n\n**Required Fields:**\n- **Stand Number** — Links the payment to the correct customer account (like an account number in a sub-ledger)\n- **First Name / Last Name** — Identifies the payer for audit verification\n- **Phone Number** — Contact reference for payment queries\n- **Receipt Date** — The actual date payment was received (not the entry date)\n- **Payment Method** — Cash, bank transfer, mobile money, etc.\n- **Amount** — The exact payment amount in the transaction currency\n- **Receipt Upload** — Photographic evidence of the physical receipt\n- **Receipt Entered By** — The staff member recording the entry (accountability control)\n\n**Example:** A payment of $500 is received from Alex Nyandoro for Stand 3314 on March 15, 2026, via bank transfer. The accounting admin captures all fields and uploads a photo of the bank receipt.`,
        screenshotPlaceholder: "Screenshot: Google Form for receipt capture showing all fields",
        screenshotSrc: receiptCaptureForm,
      },
      {
        title: "Data Flow: Form to Ledger",
        content: `The payment data follows a structured pipeline — think of it as a journal entry moving through the accounting cycle:\n\n**Stage 1: Input (Journal Entry Creation)**\nGoogle Form → Data is submitted by accounting staff\n\n**Stage 2: Processing (Posting)**\nMake.com automation → Validates and routes the data to the system\n\n**Stage 3: Recording (Ledger Update)**\nThe system → Updates the customer's account in the collection schedule\n\n**Stage 4: Verification (Trial Balance Check)**\nThe ledger → Reflects the new balance, and the payment appears in the customer's history\n\nThis mirrors the traditional accounting cycle: Source Document → Journal → Ledger → Trial Balance`,
        videoPlaceholder: "Video: Animated walkthrough of the data flow from form submission to ledger update",
      },
      {
        title: "Accounting Impact & Controls",
        content: `**Payment Recognition:**\nA payment is recognized when:\n1. The receipt form is submitted with valid supporting documentation\n2. The data passes through the automation pipeline\n3. The amount is posted to the customer's account\n\n**Audit Trail Creation:**\nEach payment entry automatically creates an audit record containing:\n- Entry timestamp\n- Staff member who entered the receipt\n- Original receipt image\n- Amount and payment method\n\n**Controls for Accuracy:**\n- **Mandatory fields** prevent incomplete entries\n- **Receipt upload requirement** ensures supporting documentation exists\n- **"Entered By" field** maintains accountability\n- **Reconciliation process** compares entries against bank statements\n\n**Example:** When Alex Nyandoro's $500 payment is entered, the system records it was entered by [Staff Name], includes the receipt photo, and the collection schedule updates to show the reduced balance.`,
      },
    ],
    quiz: [
      {
        id: "rc-q1",
        question: "Why is the 'Receipt Date' different from the date the form is filled in?",
        options: [
          "They are always the same",
          "The receipt date is when payment was received, which may differ from the data entry date",
          "The receipt date is automatically generated",
          "It doesn't matter which date is used",
        ],
        correctIndex: 1,
        explanation: "The receipt date reflects when the customer actually made the payment, while the form might be filled in later. Using the correct receipt date ensures accurate financial period recording.",
      },
      {
        id: "rc-q2",
        question: "What accounting concept does the 'Receipt Entered By' field support?",
        options: ["Revenue recognition", "Accountability and segregation of duties", "Depreciation tracking", "Inventory management"],
        correctIndex: 1,
        explanation: "Recording who entered the receipt establishes accountability and supports the principle of segregation of duties — a key internal control.",
      },
      {
        id: "rc-q3",
        question: "Alex Nyandoro's payment of $500 was entered but doesn't appear in his account. What is the first thing you should check?",
        options: [
          "Whether Alex has an internet connection",
          "Whether the Stand Number was entered correctly on the form",
          "Whether Alex has other outstanding payments",
          "Whether the payment amount was correct",
        ],
        correctIndex: 1,
        explanation: "An incorrect Stand Number would route the payment to the wrong account. This is the most common cause of 'missing' payments and should be checked first.",
      },
      {
        id: "rc-q4",
        question: "The data flow from receipt capture to ledger is analogous to which accounting cycle?",
        options: [
          "Budget cycle",
          "Source Document → Journal → Ledger → Trial Balance",
          "Payroll cycle",
          "Inventory cycle",
        ],
        correctIndex: 1,
        explanation: "The receipt capture mirrors the traditional accounting cycle: the form is the source document, processing creates the journal entry, and the ledger is updated to reflect the new balance.",
      },
      {
        id: "rc-q5",
        question: "Why is a receipt upload mandatory for each payment entry?",
        options: [
          "To make the form look complete",
          "To provide supporting documentation for the audit trail",
          "To verify the customer's identity",
          "To calculate the payment amount",
        ],
        correctIndex: 1,
        explanation: "Receipt uploads serve as source documents — the foundational evidence that a transaction occurred. This is essential for audit readiness and financial integrity.",
      },
    ],
  },
  {
    id: "deposits-payment-logic",
    number: 3,
    title: "Deposits & Payment Logic",
    icon: "💰",
    objective: "Understand how deposits are treated within the system, the distinction between commitment and revenue, and how edge cases like partial and overpayments are handled.",
    estimatedMinutes: 25,
    sections: [
      {
        title: "What is a Deposit?",
        content: `In the LakeCity system, a **deposit** represents the customer's first payment and serves as a commitment to purchase. It is treated as **Payment #1** in the collection schedule.\n\n**Key Characteristics:**\n- The deposit is the initial financial commitment made by the buyer\n- It signals intent to proceed with the Agreement of Sale\n- It is recorded as the first entry in the payment schedule\n- It may differ in amount from subsequent installments\n\n**Accounting Treatment:**\nThe deposit is recognized as a receivable reduction — it reduces the total outstanding balance owed by the customer. Think of it as the first credit entry against the customer's account receivable.\n\n**Example:** Alex Nyandoro pays a deposit of $2,000 for Stand 3314. This is recorded as Payment #1, reducing his total outstanding balance from the full purchase price.`,
      },
      {
        title: "Commitment vs Revenue Recognition",
        content: `Understanding when a deposit transitions from a commitment to recognized revenue is crucial:\n\n**Deposit as Commitment:**\n- At the time of payment, the deposit represents a customer's intention to proceed\n- It creates a contractual obligation on both sides\n- The Agreement of Sale formalizes this commitment\n\n**Allocation Logic:**\n- The deposit is allocated directly against the total purchase price\n- It establishes the remaining balance for future installments\n- The payment schedule is calculated based on the balance after deposit\n\n**Think of it like:**\n- A deposit is like a down payment on a mortgage — it reduces the principal, and future payments are calculated on the remaining balance\n- The collection schedule acts like an amortization table`,
      },
      {
        title: "Edge Cases: Partial & Overpayments",
        content: `**Partial Payments:**\nWhen a customer pays less than the scheduled installment amount:\n- The partial amount is recorded as received\n- The shortfall carries forward to the next period\n- The account may be flagged as "partially paid" rather than "current"\n- Collections follow-up may be triggered\n\n**Overpayments:**\nWhen a customer pays more than the scheduled amount:\n- The excess is applied to future installments\n- The payment schedule adjusts accordingly\n- The customer's next due date may shift\n\n**Example:** Alex Nyandoro's monthly installment is $300, but he pays $500. The extra $200 is applied to his next installment, reducing his upcoming payment to $100. His account shows as "ahead of schedule."`,
      },
    ],
    quiz: [
      {
        id: "dp-q1",
        question: "How is a deposit treated in the LakeCity collection schedule?",
        options: ["As a fee separate from the purchase price", "As Payment #1 that reduces the total outstanding balance", "As a refundable security deposit", "As an administrative charge"],
        correctIndex: 1,
        explanation: "The deposit is treated as the first payment (Payment #1) in the collection schedule, directly reducing the customer's outstanding balance.",
      },
      {
        id: "dp-q2",
        question: "Alex Nyandoro pays $500 when his scheduled installment is $300. What happens to the extra $200?",
        options: ["It is refunded to Alex", "It is applied to his next installment", "It is held in a suspense account", "It is treated as a penalty payment"],
        correctIndex: 1,
        explanation: "Overpayments are applied to future installments, reducing the customer's upcoming payment obligations.",
      },
      {
        id: "dp-q3",
        question: "What document formalizes the commitment represented by the deposit?",
        options: ["The receipt", "The Agreement of Sale", "The monthly statement", "The collection schedule"],
        correctIndex: 1,
        explanation: "The Agreement of Sale is the legal document that formalizes the commitment between the buyer and LakeCity, of which the deposit is the first financial expression.",
      },
      {
        id: "dp-q4",
        question: "If a customer makes a partial payment, what is the accounting impact?",
        options: ["The payment is rejected", "The shortfall carries forward and may trigger collections follow-up", "The partial amount is held until full payment is received", "The payment schedule is cancelled"],
        correctIndex: 1,
        explanation: "Partial payments are recorded as received, but the shortfall carries forward and may flag the account for collections follow-up.",
      },
      {
        id: "dp-q5",
        question: "How is the deposit similar to a concept in traditional finance?",
        options: ["An insurance premium", "A down payment on a mortgage that reduces the principal", "A rental deposit", "A tax prepayment"],
        correctIndex: 1,
        explanation: "Like a mortgage down payment, the deposit reduces the principal (total purchase price), and future installments are calculated on the remaining balance.",
      },
    ],
  },
  {
    id: "collection-schedule",
    number: 4,
    title: "Collection Schedule & Payment Plan Mechanics",
    icon: "📅",
    objective: "Understand how payment schedules are structured, due date logic, installment calculations, and how the system supports receivables tracking and cash flow forecasting.",
    estimatedMinutes: 30,
    sections: [
      {
        title: "Payment Schedule Structure",
        content: `The collection schedule is the backbone of LakeCity's financial tracking system. It functions like an accounts receivable sub-ledger for each customer.\n\n**Key Components:**\n- **Total Purchase Price** — The agreed amount from the Agreement of Sale\n- **Deposit (Payment #1)** — The initial payment\n- **Remaining Balance** — Total price minus deposit\n- **Monthly Installment** — The calculated periodic payment amount\n- **Number of Installments** — Total payment periods\n\n**How Installments Are Calculated:**\nThe system uses Column K (installment amount) from the collection schedule. This represents the agreed monthly payment based on:\n- Remaining balance after deposit\n- Number of agreed payment periods\n- Any negotiated adjustments\n\n**Example:** Alex Nyandoro's Agreement of Sale is for $36,000. After a $2,000 deposit, his remaining balance is $34,000. With 34 monthly installments, his Column K value shows $1,000/month.`,
        screenshotPlaceholder: "Screenshot: Collection schedule showing installment breakdown",
        screenshotSrc: collectionSchedule,
      },
      {
        title: "Due Date Logic",
        content: `Due dates are derived from **Column L** in the collection schedule, which records the payment start date.\n\n**How Due Dates Work:**\n- The first installment due date is set based on Column L\n- Subsequent due dates follow monthly intervals\n- The system tracks which payments have been received against which due dates\n\n**Overdue Detection:**\n- If a payment is not received by the due date, the account is flagged\n- The number of days overdue is calculated automatically\n- Collections protocols are triggered based on the severity of the overdue status\n\n**Example:** Alex Nyandoro's payment start date (Column L) is January 15, 2026. His first installment is due January 15, his second on February 15, and so on. If he doesn't pay by February 15, his account shows 1 payment overdue.`,
      },
      {
        title: "Receivables Tracking & Cash Flow",
        content: `**Receivables Tracking:**\nThe collection schedule provides real-time visibility into:\n- Total receivables outstanding across all customers\n- Individual customer balance positions\n- Aging analysis (current, 30 days, 60 days, 90+ days)\n\n**Cash Flow Forecasting:**\nBy analyzing the payment schedule, management can forecast:\n- Expected monthly collections\n- Potential shortfalls based on payment patterns\n- Seasonal trends in payment behavior\n\nThis is analogous to preparing a cash flow projection from an aged receivables report in traditional accounting.`,
      },
    ],
    quiz: [
      {
        id: "cs-q1",
        question: "What does Column K in the collection schedule represent?",
        options: ["The customer's phone number", "The monthly installment amount", "The total purchase price", "The deposit amount"],
        correctIndex: 1,
        explanation: "Column K represents the agreed monthly installment amount that the customer is expected to pay each period.",
      },
      {
        id: "cs-q2",
        question: "How is an overdue payment detected by the system?",
        options: ["A manager manually flags it", "The system compares the due date (from Column L) against received payments", "The customer reports it", "It is detected during monthly audits only"],
        correctIndex: 1,
        explanation: "The system automatically compares due dates derived from Column L against actual payment records to detect overdue accounts.",
      },
      {
        id: "cs-q3",
        question: "Alex Nyandoro's total purchase price is $36,000 with a $2,000 deposit. What is his remaining balance?",
        options: ["$36,000", "$38,000", "$34,000", "$2,000"],
        correctIndex: 2,
        explanation: "The remaining balance is calculated as Total Purchase Price ($36,000) minus Deposit ($2,000) = $34,000.",
      },
      {
        id: "cs-q4",
        question: "What traditional accounting tool is the collection schedule most similar to?",
        options: ["A trial balance", "An accounts receivable sub-ledger", "A balance sheet", "A profit and loss statement"],
        correctIndex: 1,
        explanation: "The collection schedule functions like an accounts receivable sub-ledger, tracking individual customer balances, payments, and outstanding amounts.",
      },
      {
        id: "cs-q5",
        question: "How can management use the collection schedule for financial planning?",
        options: ["It cannot be used for planning", "By forecasting expected monthly collections and identifying potential shortfalls", "Only for calculating taxes", "Only for preparing annual reports"],
        correctIndex: 1,
        explanation: "The collection schedule enables cash flow forecasting by projecting expected collections based on payment schedules and identifying potential shortfalls from overdue patterns.",
      },
    ],
  },
  {
    id: "agreement-of-sale",
    number: 5,
    title: "Agreement of Sale & Linked Records",
    icon: "📄",
    objective: "Understand how Agreements of Sale connect to client profiles, payment schedules, and the legal-financial alignment they represent.",
    estimatedMinutes: 20,
    sections: [
      {
        title: "Agreement Structure & Links",
        content: `The Agreement of Sale is the foundational legal document that governs the relationship between LakeCity and each customer.\n\n**Key Links:**\n- **Client Profile** — The agreement is linked to the customer's profile via their stand number\n- **Payment Schedule** — The agreed purchase price and terms are reflected in the collection schedule\n- **Deposit Record** — The initial payment is recorded against the agreement\n\n**What the Agreement Contains:**\n- Customer details (name, contact information)\n- Stand details (number, location, size)\n- Financial terms (total price, deposit, installment plan)\n- Legal obligations (both parties)\n\n**Example:** Alex Nyandoro's Agreement of Sale for Stand 3314 outlines a total purchase price of $36,000, a deposit of $2,000, and 34 monthly installments of $1,000.`,
        screenshotPlaceholder: "Screenshot: Agreement of Sale document view",
        screenshotSrc: agreementOfSale,
      },
      {
        title: "Legal vs Financial Alignment",
        content: `**Why Alignment Matters:**\nThe Agreement of Sale creates a legal obligation that must be accurately reflected in the financial records:\n\n1. **Terms Match** — The payment schedule must exactly match the terms in the agreement\n2. **Amount Accuracy** — The total price in the system must match the agreement\n3. **Date Consistency** — Payment start dates must align with the agreement date\n\n**Discrepancies Are Red Flags:**\nIf there is a mismatch between the agreement and the system records, this could indicate:\n- Data entry errors\n- Unauthorized modifications\n- Potential compliance issues\n\n**Control Point:** Any changes to financial terms should be traced back to a formal amendment of the Agreement of Sale, creating a paper trail.`,
      },
    ],
    quiz: [
      {
        id: "aos-q1",
        question: "What links the Agreement of Sale to the customer's account in the system?",
        options: ["The customer's email", "The stand number", "The payment amount", "The customer's phone number"],
        correctIndex: 1,
        explanation: "The stand number is the primary identifier that links the Agreement of Sale to the customer's profile and payment records.",
      },
      {
        id: "aos-q2",
        question: "If the payment schedule shows a different total price than the Agreement of Sale, what should you do?",
        options: ["Ignore it — system errors are normal", "Investigate the discrepancy as a potential data entry error or unauthorized modification", "Change the agreement to match the system", "Ask the customer what the correct amount is"],
        correctIndex: 1,
        explanation: "Discrepancies between legal documents and financial records are red flags requiring investigation to ensure data integrity and compliance.",
      },
      {
        id: "aos-q3",
        question: "Why must changes to financial terms be traced back to a formal agreement amendment?",
        options: ["For marketing purposes", "To maintain a legal paper trail and ensure accountability", "Because the system requires it", "To inform other customers"],
        correctIndex: 1,
        explanation: "Formal amendments create a documented paper trail that protects both LakeCity and the customer, ensuring accountability and legal compliance.",
      },
      {
        id: "aos-q4",
        question: "What information does the Agreement of Sale NOT typically contain?",
        options: ["Customer contact details", "Stand location and size", "Internal staff performance reviews", "Financial terms and payment schedule"],
        correctIndex: 2,
        explanation: "The Agreement of Sale contains customer details, stand information, and financial terms — but not internal operational information like staff performance reviews.",
      },
      {
        id: "aos-q5",
        question: "How does the deposit relate to the Agreement of Sale?",
        options: ["It is unrelated", "The deposit is the first financial expression of the commitment outlined in the agreement", "The deposit replaces the agreement", "The deposit is only recorded in the agreement, not the system"],
        correctIndex: 1,
        explanation: "The deposit is the first payment that activates the financial obligations outlined in the Agreement of Sale.",
      },
    ],
  },
  {
    id: "client-experience",
    number: 6,
    title: "Client Experience (External View)",
    icon: "👁️",
    objective: "Understand what customers see in the system, including payment tracking, status updates, and how transparency principles are maintained.",
    estimatedMinutes: 20,
    sections: [
      {
        title: "The Customer Dashboard",
        content: `When a customer logs in, they see a clean, focused dashboard designed to provide transparency into their account:\n\n**Key Elements:**\n- **Payment Summary** — Current balance, total paid, last payment date\n- **Payment History** — Chronological list of all payments made\n- **Monthly Statements** — Generated statements showing opening balance, payments, and closing balance\n- **Agreement of Sale** — Access to their agreement documents\n- **Updates** — Company announcements and communications\n\n**Example:** Alex Nyandoro logs in and sees:\n- Total paid: $14,000 of $36,000\n- Last payment: March 1, 2026 — $1,000\n- Next due: April 1, 2026\n- 14 of 35 payments completed`,
        screenshotPlaceholder: "Screenshot: Customer dashboard showing payment summary",
        screenshotSrc: homeDashboard,
      },
      {
        title: "Transparency Principles",
        content: `**LakeCity's commitment to transparency means customers should always be able to:**\n\n1. **See exactly how much they've paid** — Complete payment history with dates and amounts\n2. **Understand their remaining obligations** — Clear balance and schedule information\n3. **Access their documents** — Agreement of Sale and monthly statements available anytime\n4. **Receive timely updates** — Company communications about important developments\n\n**What Customers Cannot See:**\n- Other customers' information\n- Internal notes or communications\n- Collection status flags\n- Staff actions or audit logs\n\n**Accounting Parallel:** Think of the customer portal as a client-facing statement of account — it shows the facts (balances, payments) without the internal workings (ledger adjustments, reconciliation notes).`,
        screenshotPlaceholder: "Screenshot: Customer payment history view",
        screenshotSrc: paymentHistory,
      },
    ],
    quiz: [
      {
        id: "ce-q1",
        question: "What can a customer see on their dashboard?",
        options: ["Other customers' payment histories", "Their own payment summary, history, statements, and agreement", "Internal staff notes about their account", "Collection status flags"],
        correctIndex: 1,
        explanation: "Customers can only see their own account information: payment summary, history, monthly statements, and agreement documents.",
      },
      {
        id: "ce-q2",
        question: "Why is it important that customers cannot see collection status flags?",
        options: ["Because flags are always inaccurate", "To maintain professional communication boundaries and handle sensitive matters through appropriate channels", "Because customers don't understand flags", "Because there are no flags in the system"],
        correctIndex: 1,
        explanation: "Collection matters are handled through professional, direct communication channels rather than system flags, maintaining appropriate boundaries.",
      },
      {
        id: "ce-q3",
        question: "The customer portal is most analogous to which financial document?",
        options: ["An internal audit report", "A client-facing statement of account", "A trial balance", "A general ledger"],
        correctIndex: 1,
        explanation: "The customer portal functions like a statement of account — showing factual information (balances, payments) without internal workings.",
      },
      {
        id: "ce-q4",
        question: "Alex Nyandoro wants to know his remaining balance. Where would he find this information?",
        options: ["He must call the office", "On his dashboard payment summary", "In the internal portal", "It is not available to customers"],
        correctIndex: 1,
        explanation: "The customer dashboard prominently displays the payment summary including remaining balance, supporting LakeCity's transparency principles.",
      },
      {
        id: "ce-q5",
        question: "What principle ensures that Alex Nyandoro cannot see another customer's data?",
        options: ["Data transparency", "Role-based access control with data isolation", "Customer preference settings", "Browser security"],
        correctIndex: 1,
        explanation: "Role-based access control ensures customers can only access their own data, with strict data isolation between accounts.",
      },
    ],
  },
  {
    id: "internal-views",
    number: 7,
    title: "Internal System Views & Actions",
    icon: "🏢",
    objective: "Understand all internal screens, what actions internal users can perform, and the accounting implications of those actions.",
    estimatedMinutes: 30,
    sections: [
      {
        title: "Internal Portal Overview",
        content: `The internal portal is the command center for LakeCity's operations. Access is controlled by role:\n\n**Available Screens (by permission):**\n- **Dashboard** — Overview of system status and key metrics\n- **Collections Command Center** — Overdue accounts, outreach tools, notes\n- **CRM / Conversations** — Customer communication management\n- **Looking Glass** — Customer account lookup tool\n- **Account Management** — User access control (Super Admin only)\n- **Reporting** — Financial reports and analytics\n- **Articles** — Customer-facing updates management\n\n**Key Actions Internal Users Can Perform:**\n- Look up any customer account\n- View payment histories and balances\n- Send communications via WhatsApp, SMS, or email\n- Add internal notes to customer records\n- Generate and review reports`,
        screenshotPlaceholder: "Screenshot: Internal portal dashboard",
      },
      {
        title: "Accounting Implications of Actions",
        content: `Every internal action has potential accounting implications:\n\n**Payment Recording:**\n- Directly impacts accounts receivable\n- Creates audit trail entries\n- Updates customer balance and payment status\n\n**Account Modifications:**\n- Changes to customer details must be logged\n- Phone number changes affect 2FA delivery\n- Email changes affect statement delivery\n\n**Collections Actions:**\n- Outreach records create a compliance trail\n- Notes document the collections effort for audit purposes\n- Follow-up dates ensure systematic account management\n\n**Reporting:**\n- Reports reflect real-time data from the ledger\n- Any inaccuracies in data entry directly impact report accuracy\n- Reports are used for management decision-making\n\n**Example:** When an admin updates Alex Nyandoro's phone number, this is logged in the audit trail. If Alex later claims he wasn't contacted about an overdue payment, the audit trail shows the communication attempts and the phone number on file at the time.`,
      },
    ],
    quiz: [
      {
        id: "iv-q1",
        question: "Why is every internal action logged in the audit trail?",
        options: ["To slow down the system", "To maintain accountability and provide evidence for compliance and dispute resolution", "To track employee work hours", "Logging is optional"],
        correctIndex: 1,
        explanation: "Audit trails maintain accountability and provide evidence for compliance requirements and dispute resolution.",
      },
      {
        id: "iv-q2",
        question: "What is the accounting impact of recording a payment incorrectly?",
        options: ["No impact — it can be easily corrected", "It directly affects accounts receivable, customer balances, and report accuracy", "It only affects the customer", "It only affects the monthly statement"],
        correctIndex: 1,
        explanation: "Incorrect payment recording has cascading effects on accounts receivable, customer balances, collection status, and management reports.",
      },
      {
        id: "iv-q3",
        question: "Which screen is restricted to Super Admin access only?",
        options: ["Collections Command Center", "CRM / Conversations", "Account Management (User Access)", "Articles"],
        correctIndex: 2,
        explanation: "Account Management is restricted to Super Admins to prevent unauthorized changes to user access and permissions.",
      },
      {
        id: "iv-q4",
        question: "Why do collections outreach records serve an accounting purpose?",
        options: ["They don't — they're only for customer service", "They create a compliance trail documenting collection efforts for audit purposes", "They automatically collect payments", "They are only used for internal training"],
        correctIndex: 1,
        explanation: "Collections outreach records create a compliance trail that documents the effort to collect receivables, which is important for audit and governance purposes.",
      },
      {
        id: "iv-q5",
        question: "If Alex Nyandoro's email is changed in the system, what must happen?",
        options: ["Nothing — it's a simple update", "The change must be logged in the audit trail for accountability", "Alex must create a new account", "The Agreement of Sale must be reissued"],
        correctIndex: 1,
        explanation: "All account modifications, including email changes, must be logged in the audit trail to maintain accountability and provide a history of changes.",
      },
    ],
  },
  {
    id: "updates-page",
    number: 8,
    title: "Updates Page (Client Communication)",
    icon: "📢",
    objective: "Understand the purpose of the Updates page, when and how to use it, and the governance principles that ensure accuracy and consistency.",
    estimatedMinutes: 15,
    sections: [
      {
        title: "Purpose & Usage",
        content: `The Updates page is a broadcast communication channel for sharing important information with all customers.\n\n**When to Use:**\n- Policy changes that affect payments or schedules\n- Important company announcements\n- Infrastructure updates (new features, maintenance)\n- Seasonal notices (holiday schedules, office closures)\n\n**How It Works:**\n1. Internal staff creates an article with title, content, and category\n2. The article can be previewed before publishing\n3. Once published, it becomes visible to all logged-in customers\n4. Optionally, it can be emailed to all customers\n\n**Example:** LakeCity needs to communicate a change in accepted payment methods. An article is created, reviewed, and published. Alex Nyandoro and all other customers see this update on their next login.`,
        screenshotPlaceholder: "Screenshot: Updates page as seen by a customer",
      },
      {
        title: "Governance Principles",
        content: `**Accuracy:**\n- All published content must be factually correct\n- Financial information must be verified before publication\n- Legal implications should be reviewed\n\n**Consistency:**\n- Communication tone should be professional and consistent\n- Updates should not contradict previous communications\n- Use standard templates where possible\n\n**Accountability:**\n- Every article records who published it\n- Broadcast records show who sent email notifications\n- The system maintains a complete history of all publications\n\n**Think of updates like external financial disclosures** — they must be accurate, consistent, and properly authorized before release.`,
      },
    ],
    quiz: [
      {
        id: "up-q1",
        question: "Before publishing a customer-facing update about payment policy changes, what should be verified?",
        options: ["Only the formatting", "Factual accuracy, financial implications, and legal review", "That the article is long enough", "That all staff have read it first"],
        correctIndex: 1,
        explanation: "Updates about payment policies have financial and legal implications that must be verified for accuracy before publication.",
      },
      {
        id: "up-q2",
        question: "Why are published updates compared to external financial disclosures?",
        options: ["They aren't similar at all", "Both must be accurate, consistent, and properly authorized before release", "Both are only for shareholders", "Both require external audit"],
        correctIndex: 1,
        explanation: "Like financial disclosures, customer-facing updates must be accurate, consistent with previous communications, and properly authorized.",
      },
      {
        id: "up-q3",
        question: "What accountability measures exist for the Updates page?",
        options: ["None — anyone can publish anonymously", "Every article records who published it and broadcast records track email notifications", "Only the IT team can publish", "Updates are automatically generated"],
        correctIndex: 1,
        explanation: "The system records the author of every article and tracks who sent email broadcasts, maintaining full accountability.",
      },
      {
        id: "up-q4",
        question: "What type of content should NOT be shared via the Updates page?",
        options: ["Policy changes", "Individual customer account details or internal operational information", "Company announcements", "Seasonal notices"],
        correctIndex: 1,
        explanation: "The Updates page is for general announcements — individual customer details and internal operations should never be shared publicly.",
      },
      {
        id: "up-q5",
        question: "Why is communication consistency important in customer updates?",
        options: ["To make updates longer", "To prevent confusion and maintain trust by ensuring new updates don't contradict previous ones", "To reduce the number of updates needed", "It's not important"],
        correctIndex: 1,
        explanation: "Consistency prevents customer confusion and maintains trust — contradictory communications can undermine credibility and create disputes.",
      },
    ],
  },
  {
    id: "quality-control",
    number: 9,
    title: "Quality Control (QC Process)",
    icon: "✅",
    objective: "Understand the QC workflow, verification steps for payments and data accuracy, risk mitigation strategies, and audit readiness requirements.",
    estimatedMinutes: 25,
    sections: [
      {
        title: "QC Workflow Overview",
        content: `Quality Control in the LakeCity system ensures that every financial entry is accurate and properly documented.\n\n**The QC Process:**\n\n**Step 1: Entry Verification**\n- Confirm the stand number matches the customer\n- Verify the amount matches the receipt\n- Check the receipt date is accurate\n- Ensure the receipt image is legible\n\n**Step 2: Cross-Reference**\n- Compare the entry against bank statements\n- Verify payment method matches the receipt\n- Confirm the customer name matches the account\n\n**Step 3: System Reconciliation**\n- Verify the payment appears in the correct customer account\n- Confirm the balance updated correctly\n- Check that the collection schedule reflects the payment\n\n**Think of this like a 3-way match in accounts payable:** Receipt ↔ Entry ↔ Bank Statement`,
      },
      {
        title: "Risk Mitigation & Audit Readiness",
        content: `**Common Risks:**\n- **Data Entry Errors** — Wrong stand number, amount, or date\n- **Missing Documentation** — Receipts not uploaded or illegible\n- **Timing Differences** — Payment date vs recording date discrepancies\n- **Duplicate Entries** — Same payment recorded twice\n\n**Mitigation Strategies:**\n- Mandatory field validation on entry forms\n- Receipt upload requirements\n- Regular reconciliation against bank statements\n- Duplicate detection in the processing pipeline\n\n**Audit Readiness:**\nThe system maintains audit readiness by ensuring:\n- Every transaction has a source document (receipt)\n- Complete audit trail of all actions\n- Segregation of duties in recording and approval\n- Regular reconciliation schedules\n\n**Example:** During an audit, the auditor asks to verify Alex Nyandoro's March payment. The system provides: the receipt image, the entry timestamp, who entered it, and the bank statement match — all from a single lookup.`,
      },
    ],
    quiz: [
      {
        id: "qc-q1",
        question: "What is the 3-way match in the QC process?",
        options: ["Customer, Staff, Manager approval", "Receipt ↔ System Entry ↔ Bank Statement", "Email, Phone, WhatsApp verification", "Agreement ↔ Payment ↔ Statement"],
        correctIndex: 1,
        explanation: "The 3-way match verifies that the physical receipt, the system entry, and the bank statement all agree — ensuring accuracy and completeness.",
      },
      {
        id: "qc-q2",
        question: "A payment of $1,000 was recorded for Alex Nyandoro, but the receipt shows $100. What type of error is this?",
        options: ["A timing difference", "A data entry error — the amount doesn't match the source document", "A duplicate entry", "A system error"],
        correctIndex: 1,
        explanation: "This is a data entry error where the recorded amount ($1,000) doesn't match the source document ($100). This highlights why the QC verification step is critical.",
      },
      {
        id: "qc-q3",
        question: "What makes the system 'audit ready'?",
        options: ["Having fast internet", "Every transaction having source documents, audit trails, segregation of duties, and regular reconciliation", "Printing all reports monthly", "Having backup servers"],
        correctIndex: 1,
        explanation: "Audit readiness requires complete documentation (source documents), full audit trails, proper controls (segregation of duties), and regular reconciliation.",
      },
      {
        id: "qc-q4",
        question: "How does the system help detect duplicate entries?",
        options: ["It doesn't — duplicates must be found manually", "Through duplicate detection in the processing pipeline", "By asking the customer", "Through monthly reports only"],
        correctIndex: 1,
        explanation: "The processing pipeline includes duplicate detection mechanisms to prevent the same payment from being recorded twice.",
      },
      {
        id: "qc-q5",
        question: "Why are 'timing differences' considered a risk?",
        options: ["They slow down the system", "They can cause payments to appear in the wrong financial period, affecting reporting accuracy", "They don't affect anything", "They only affect the customer"],
        correctIndex: 1,
        explanation: "Timing differences between when a payment is received and when it's recorded can cause transactions to appear in the wrong financial period, affecting the accuracy of periodic reports.",
      },
    ],
  },
  {
    id: "reporting-oversight",
    number: 10,
    title: "Reporting & Financial Oversight",
    icon: "📊",
    objective: "Understand the reporting capabilities, what senior accountants should monitor, and how reports support decision-making and financial oversight.",
    estimatedMinutes: 25,
    sections: [
      {
        title: "Available Reports",
        content: `The reporting module provides senior accountants and management with comprehensive financial visibility:\n\n**Key Reports:**\n\n1. **Revenue Summary** — Total collections, period comparisons, trend analysis\n2. **Collections Dashboard** — Overdue accounts, aging analysis, collection efficiency\n3. **Geographic Revenue** — Revenue distribution by location/project\n4. **Payment Trends** — Historical payment patterns and forecasting data\n\n**Report Characteristics:**\n- Real-time data from the collection schedule\n- Filterable by date range, project, and status\n- Visual charts and graphs for quick analysis\n- Exportable for external reporting\n\n**Example:** The Finance Director reviews the monthly revenue summary and notices that collections for the quarter are 15% below forecast. The aging report reveals that 30 accounts have moved into the 60-day overdue category, prompting a focused collections effort.`,
        screenshotPlaceholder: "Screenshot: Reporting dashboard with revenue charts",
      },
      {
        title: "Monitoring & Decision-Making",
        content: `**What Senior Accountants Should Monitor:**\n\n1. **Collection Rates** — Are payments coming in on schedule?\n2. **Outstanding Balances** — Total receivables and aging distribution\n3. **Overdue Trends** — Are overdue accounts increasing or decreasing?\n4. **Payment Method Mix** — Distribution of payment channels\n\n**Decision-Making Insights:**\n- **High overdue concentration** → May indicate economic pressure or collection process gaps\n- **Declining collection rates** → May require policy review or additional resources\n- **Payment method shifts** → May suggest need for new payment channels\n\n**Financial Oversight Responsibilities:**\n- Regular review of all financial reports\n- Investigation of anomalies or unusual patterns\n- Ensuring reconciliation is performed on schedule\n- Reporting to stakeholders on financial performance\n\n**Think of reporting as the financial compass** — it tells management where the organization is, where it's heading, and whether course corrections are needed.`,
      },
    ],
    quiz: [
      {
        id: "ro-q1",
        question: "What should a senior accountant do when the aging report shows a significant increase in 60-day overdue accounts?",
        options: ["Ignore it — fluctuations are normal", "Investigate the cause and initiate a focused collections effort", "Delete the overdue accounts", "Reduce the payment amounts for those customers"],
        correctIndex: 1,
        explanation: "A significant increase in overdue accounts requires investigation and proactive collections intervention to protect the organization's receivables.",
      },
      {
        id: "ro-q2",
        question: "Why is the reporting module described as a 'financial compass'?",
        options: ["Because it points north", "Because it shows where the organization is financially and whether course corrections are needed", "Because it replaces the need for accountants", "Because it only shows past data"],
        correctIndex: 1,
        explanation: "Like a compass, financial reports orient management by showing current position, direction of travel, and whether adjustments are needed.",
      },
      {
        id: "ro-q3",
        question: "What could a shift in payment method mix indicate?",
        options: ["Nothing — it's irrelevant", "A potential need for new payment channels or investigation into why customers are changing payment methods", "That the system is broken", "That customers are unhappy"],
        correctIndex: 1,
        explanation: "Changes in payment method preferences can indicate market trends, customer needs, or accessibility issues that may require adding new payment channels.",
      },
      {
        id: "ro-q4",
        question: "How often should reconciliation be performed?",
        options: ["Only during audits", "On a regular schedule as determined by financial oversight requirements", "Once a year", "It's not necessary if reports look correct"],
        correctIndex: 1,
        explanation: "Regular reconciliation ensures ongoing accuracy of financial records and prevents errors from compounding over time.",
      },
      {
        id: "ro-q5",
        question: "Which of the following is NOT a key metric for senior accountants to monitor?",
        options: ["Collection rates", "Outstanding balance aging", "Staff lunch schedules", "Payment method distribution"],
        correctIndex: 2,
        explanation: "Senior accountants should focus on financial metrics like collection rates, aging balances, and payment patterns — not operational details like staff schedules.",
      },
    ],
  },
];

// Admin path: lighter versions of the same modules
export const ADMIN_MODULES: TrainingModule[] = LEAD_MODULES.map((mod) => ({
  ...mod,
  id: `admin-${mod.id}`,
  // Admin path uses fewer sections (first section of each module)
  sections: mod.sections.slice(0, Math.min(2, mod.sections.length)),
  estimatedMinutes: Math.ceil(mod.estimatedMinutes * 0.6),
}));

export type TrainingPath = "lead" | "admin";

export function getModules(path: TrainingPath): TrainingModule[] {
  return path === "lead" ? LEAD_MODULES : ADMIN_MODULES;
}
