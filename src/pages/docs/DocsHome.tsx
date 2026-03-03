import { Link } from "react-router-dom";
import DocsLayout from "@/components/docs/DocsLayout";
import { BookOpen, Database, Key, Code2, AlertTriangle, Zap } from "lucide-react";

const cards = [
  { icon: Zap, title: "Quickstart", desc: "Get up and running with StandLedger APIs in 5 minutes.", href: "/docs/quickstart" },
  { icon: BookOpen, title: "Glossary", desc: "Key terms and definitions used across the platform.", href: "/docs/glossary" },
  { icon: Database, title: "Data Models", desc: "Collection Schedule field definitions and constraints.", href: "/docs/data-models" },
  { icon: Code2, title: "API Reference", desc: "JSON schemas, endpoints, and webhook specifications.", href: "/docs/api-reference" },
  { icon: Key, title: "Authentication", desc: "OAuth2, API keys, scopes, and rate limits.", href: "/docs/authentication" },
  { icon: AlertTriangle, title: "Error Codes", desc: "Standard error responses and troubleshooting.", href: "/docs/errors" },
];

export default function DocsHome() {
  return (
    <DocsLayout
      title="StandLedger Developer Documentation"
      subtitle="Build integrations, automate workflows, and connect with StandLedger's payment and land management platform."
      breadcrumb="Overview"
      onThisPage={[
        { label: "Getting Started", id: "getting-started" },
        { label: "Platform Overview", id: "platform-overview" },
        { label: "Resources", id: "resources" },
      ]}
    >
      <h2 id="getting-started">Getting Started</h2>
      <p>
        Welcome to the StandLedger Developer Documentation. StandLedger is a BNPL (Buy Now, Pay Later) land development 
        management platform operated by Warwickshire. It manages customer payment schedules, receipts, agreements of sale, 
        and compliance tracking for land parcels across multiple geographies.
      </p>
      <p>
        Whether you're a fintech partner building a payment integration, a QA engineer writing test automation, or a 
        developer building data pipelines — this documentation provides everything you need to understand StandLedger's 
        data models, APIs, and integration requirements.
      </p>

      <h2 id="platform-overview">Platform Overview</h2>
      <p>
        StandLedger v1 uses <strong>Google Sheets</strong> as its primary data store for the Collection Schedule — the 
        authoritative financial ledger. This influences how external developers will read, write, and integrate with the system.
      </p>
      <ul>
        <li><strong>Collection Schedule</strong> — The master ledger containing all customer payment plans, installment tracking, and agreement statuses.</li>
        <li><strong>Receipts Intake</strong> — A staging layer where payment receipts are ingested, validated, and approved before aggregation into the ledger.</li>
        <li><strong>Support Requests</strong> — Customer-generated tickets for payment reconciliation or documentation issues.</li>
        <li><strong>Monthly Statements</strong> — Auto-generated financial summaries for each customer per month.</li>
      </ul>

      <h2 id="resources">Resources</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 not-prose mt-4">
        {cards.map((card) => (
          <Link
            key={card.href}
            to={card.href}
            className="border border-border rounded-lg p-5 hover:shadow-md transition-shadow bg-card group"
          >
            <card.icon className="h-6 w-6 text-primary mb-3 group-hover:scale-110 transition-transform" />
            <h3 className="font-semibold text-foreground text-base mb-1">{card.title}</h3>
            <p className="text-sm text-muted-foreground">{card.desc}</p>
          </Link>
        ))}
      </div>
    </DocsLayout>
  );
}
