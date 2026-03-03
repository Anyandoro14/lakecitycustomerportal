import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, ChevronRight, Menu, X, Search, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href?: string;
  children?: NavItem[];
}

const navigation: NavItem[] = [
  {
    label: "Overview",
    children: [
      { label: "Introduction", href: "/docs" },
      { label: "Quickstart", href: "/docs/quickstart" },
    ],
  },
  {
    label: "Data Models",
    children: [
      { label: "Glossary", href: "/docs/glossary" },
      { label: "Collection Schedule", href: "/docs/data-models" },
      { label: "Sheets & Tabs", href: "/docs/sheets" },
    ],
  },
  {
    label: "API Reference",
    children: [
      { label: "Schemas", href: "/docs/api-reference" },
      { label: "Endpoints", href: "/docs/endpoints" },
      { label: "Webhooks", href: "/docs/webhooks" },
    ],
  },
  {
    label: "Authentication",
    href: "/docs/authentication",
  },
  {
    label: "Error Codes",
    href: "/docs/errors",
  },
];

const topTabs = [
  { label: "Home", href: "/docs" },
  { label: "Get Started", href: "/docs/quickstart" },
  { label: "Data Models", href: "/docs/data-models" },
  { label: "APIs", href: "/docs/api-reference" },
  { label: "Authentication", href: "/docs/authentication" },
];

interface DocsLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  breadcrumb?: string;
  onThisPage?: { label: string; id: string }[];
}

export default function DocsLayout({ children, title, subtitle, breadcrumb, onThisPage }: DocsLayoutProps) {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<string[]>(["Overview", "Data Models", "API Reference"]);

  const toggleSection = (label: string) => {
    setExpandedSections((prev) =>
      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
    );
  };

  const isActive = (href?: string) => href === location.pathname;

  const activeTab = topTabs.find((t) => {
    if (t.href === "/docs") return location.pathname === "/docs";
    return location.pathname.startsWith(t.href);
  });

  return (
    <div className="min-h-screen bg-card font-body">
      {/* Top Bar */}
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 flex items-center justify-between h-14">
          <Link to="/docs" className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <span className="font-display text-lg font-bold text-primary">StandLedger</span>
            <span className="text-muted-foreground text-sm">Developers</span>
          </Link>
          <div className="hidden md:flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search..."
                className="pl-9 pr-4 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary w-56"
              />
            </div>
          </div>
          <button className="md:hidden" onClick={() => setMobileNavOpen(!mobileNavOpen)}>
            {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Top Tabs */}
        <div className="max-w-[1400px] mx-auto px-4 hidden md:flex gap-6 text-sm">
          {topTabs.map((tab) => (
            <Link
              key={tab.href}
              to={tab.href}
              className={cn(
                "py-2.5 border-b-2 transition-colors",
                activeTab?.href === tab.href
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "w-64 shrink-0 border-r border-border bg-card overflow-y-auto sticky top-[105px] h-[calc(100vh-105px)] py-6 px-4 hidden md:block",
            mobileNavOpen && "!block fixed inset-0 top-[105px] z-40 w-full md:w-64"
          )}
        >
          <nav className="space-y-1">
            {navigation.map((item) => (
              <div key={item.label}>
                {item.children ? (
                  <>
                    <button
                      onClick={() => toggleSection(item.label)}
                      className="flex items-center justify-between w-full text-sm font-semibold text-foreground py-2 hover:text-primary"
                    >
                      {item.label}
                      {expandedSections.includes(item.label) ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </button>
                    {expandedSections.includes(item.label) && (
                      <div className="ml-3 space-y-0.5 border-l border-border pl-3">
                        {item.children.map((child) => (
                          <Link
                            key={child.href}
                            to={child.href!}
                            className={cn(
                              "block text-sm py-1.5 transition-colors",
                              isActive(child.href)
                                ? "text-primary font-medium"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <Link
                    to={item.href!}
                    className={cn(
                      "block text-sm font-semibold py-2 transition-colors",
                      isActive(item.href)
                        ? "text-primary"
                        : "text-foreground hover:text-primary"
                    )}
                  >
                    {item.label}
                  </Link>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 py-8 px-6 md:px-10 lg:px-16">
          {breadcrumb && (
            <p className="text-sm text-primary font-medium mb-1">{breadcrumb}</p>
          )}
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-2">{title}</h1>
          {subtitle && (
            <p className="text-muted-foreground text-lg mb-6 leading-relaxed">{subtitle}</p>
          )}
          <hr className="border-border mb-8" />
          <div className="prose prose-sm max-w-none
            [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-foreground [&_h2]:mt-10 [&_h2]:mb-4
            [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-8 [&_h3]:mb-3
            [&_p]:text-foreground/80 [&_p]:leading-relaxed [&_p]:mb-4
            [&_ul]:text-foreground/80 [&_li]:mb-1
            [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono
            [&_pre]:bg-foreground [&_pre]:text-primary-foreground [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:text-sm
            [&_table]:w-full [&_table]:border-collapse
            [&_th]:bg-muted [&_th]:text-left [&_th]:px-4 [&_th]:py-2 [&_th]:text-sm [&_th]:font-semibold [&_th]:border [&_th]:border-border
            [&_td]:px-4 [&_td]:py-2 [&_td]:text-sm [&_td]:border [&_td]:border-border
          ">
            {children}
          </div>
        </main>

        {/* Right sidebar - On this page */}
        {onThisPage && onThisPage.length > 0 && (
          <aside className="w-52 shrink-0 hidden lg:block sticky top-[105px] h-[calc(100vh-105px)] py-8 pr-4">
            <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <span className="text-muted-foreground">≡</span> On this page
            </p>
            <nav className="space-y-1">
              {onThisPage.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="block text-sm text-muted-foreground hover:text-primary transition-colors py-1"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>
        )}
      </div>
    </div>
  );
}
