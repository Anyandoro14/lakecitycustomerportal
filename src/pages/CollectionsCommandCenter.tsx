import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  Users,
  Clock,
  Send,
  ChevronUp,
  Calendar,
  ShieldAlert,
  RefreshCw,
  Sparkles,
  MessageSquare,
  History,
  Search,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BottomNav from "@/components/BottomNav";
import InternalNav from "@/components/InternalNav";
import { toast } from "sonner";
import OutreachDialog from "@/components/collections/OutreachDialog";
import TimelinePanel from "@/components/collections/TimelinePanel";

// ── helpers ──────────────────────────────────────────────────────────────────

const parseCurrency = (v: string) => parseFloat((v || "0").replace(/[$,]/g, "")) || 0;

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const overdueSeverity = (days: number) => {
  if (days >= 30) return { label: "Critical", className: "bg-red-900 text-white" };
  if (days >= 10) return { label: "High", className: "bg-destructive text-destructive-foreground" };
  if (days >= 4) return { label: "Medium", className: "bg-orange-500 text-white" };
  if (days >= 1) return { label: "Low", className: "bg-yellow-500 text-yellow-950" };
  return { label: "Current", className: "bg-muted text-muted-foreground" };
};

const overdueRowClass = (days: number) => {
  if (days >= 30) return "bg-red-950/20 border-l-4 border-l-red-900";
  if (days >= 10) return "bg-red-500/10 border-l-4 border-l-destructive";
  if (days >= 4) return "bg-orange-500/10 border-l-4 border-l-orange-500";
  if (days >= 1) return "bg-yellow-500/10 border-l-4 border-l-yellow-500";
  return "";
};

// ── component ────────────────────────────────────────────────────────────────

const CollectionsCommandCenter = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isDirector, setIsDirector] = useState(false);
  const [reportingData, setReportingData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [escalationFilter, setEscalationFilter] = useState<string>("all");

  // Outreach dialog state
  const [outreachOpen, setOutreachOpen] = useState(false);
  const [outreachStand, setOutreachStand] = useState<any>(null);
  const [outreachType, setOutreachType] = useState<"reminder" | "follow_up" | "escalation">("reminder");

  // Timeline panel state
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineStand, setTimelineStand] = useState<any>(null);

  useEffect(() => {
    checkAccessAndLoad();
  }, []);

  const checkAccessAndLoad = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please log in to access collections");
        navigate("/internal-login");
        return;
      }

      const { data, error } = await supabase.functions.invoke("check-reporting-access");
      if (error) throw error;
      if (!data.hasAccess) {
        toast.error("Access denied.");
        navigate("/");
        return;
      }

      setHasAccess(true);
      setIsSuperAdmin(data.isSuperAdmin);
      setIsDirector(data.isDirector || false);
      await fetchData();
    } catch (err: any) {
      console.error("Access check error:", err);
      toast.error("Failed to verify access");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("fetch-reporting-data");
      if (error) throw error;
      setReportingData(data);
    } catch (err: any) {
      console.error("Fetch error:", err);
      toast.error("Failed to load collections data");
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    toast.success("Data refreshed");
  };

  // ── outreach handlers ─────────────────────────────────────────────────

  const openOutreach = (stand: any, type: "reminder" | "follow_up" | "escalation") => {
    setOutreachStand(stand);
    setOutreachType(type);
    setOutreachOpen(true);
  };

  const openTimeline = (stand: any) => {
    setTimelineStand(stand);
    setTimelineOpen(true);
  };

  // ── derived data ─────────────────────────────────────────────────────────

  const soldStands = useMemo(
    () => (reportingData?.stands || []).filter((s: any) => !s.isUnsold),
    [reportingData]
  );

  const currentMonthName = new Date().toLocaleString("en-US", { month: "long" });
  const currentYear = new Date().getFullYear();

  const metrics = useMemo(() => {
    if (!soldStands.length)
      return {
        expectedThisMonth: 0, collectedThisMonth: 0, collectionPct: 0,
        standardOutstanding: 0, extensionOutstanding: 0, totalOverdue: 0, highRisk: 0,
      };

    let expectedThisMonth = 0, collectedThisMonth = 0, standardOutstanding = 0,
      extensionOutstanding = 0, totalOverdue = 0, highRisk = 0;

    soldStands.forEach((s: any) => {
      const monthly = parseCurrency(s.monthlyPayment);
      const balance = parseCurrency(s.currentBalance);
      const category = (s.customerCategory || "").toLowerCase();
      const isExtension = category.includes("extension");

      expectedThisMonth += monthly;

      const thisMonthPayment = (s.payments || []).find((p: any) => {
        const m = p.month?.match(
          /\d+\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i
        );
        return m && m[1] === currentMonthName && parseInt(m[2]) === currentYear;
      });
      if (thisMonthPayment) collectedThisMonth += thisMonthPayment.amountNumeric || 0;

      if (isExtension) extensionOutstanding += balance;
      else standardOutstanding += balance;

      if ((s.daysOverdue || 0) > 0) totalOverdue++;
      if ((s.daysOverdue || 0) >= 30) highRisk++;
    });

    return {
      expectedThisMonth, collectedThisMonth,
      collectionPct: expectedThisMonth > 0 ? (collectedThisMonth / expectedThisMonth) * 100 : 0,
      standardOutstanding, extensionOutstanding, totalOverdue, highRisk,
    };
  }, [soldStands, currentMonthName, currentYear]);

  const dueToday = useMemo(() => {
    return soldStands
      .filter((s: any) => {
        const isPastDue = (s.daysOverdue || 0) > 0;
        const isPrepaid = (s.prepaidDays || 0) > 0;
        return !isPrepaid && !isPastDue;
      })
      .map((s: any) => {
        let daysSinceLastPayment = 0;
        const payments = s.payments || [];
        if (payments.length > 0) {
          const lastPayment = payments[payments.length - 1];
          const match = lastPayment.month?.match(
            /(\d+)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i
          );
          if (match) {
            const monthNames = ["january","february","march","april","may","june","july","august","september","october","november","december"];
            const payDate = new Date(parseInt(match[3]), monthNames.indexOf(match[2].toLowerCase()), parseInt(match[1]));
            daysSinceLastPayment = Math.floor((Date.now() - payDate.getTime()) / (1000 * 60 * 60 * 24));
          }
        }
        return { ...s, daysSinceLastPayment };
      });
  }, [soldStands]);

  const overdueAccounts = useMemo(
    () =>
      soldStands
        .filter((s: any) => (s.daysOverdue || 0) > 0)
        .sort((a: any, b: any) => (b.daysOverdue || 0) - (a.daysOverdue || 0)),
    [soldStands]
  );

  const extensionAccounts = useMemo(
    () =>
      soldStands.filter((s: any) =>
        (s.customerCategory || "").toLowerCase().includes("extension")
      ),
    [soldStands]
  );

  // ── filter logic ──────────────────────────────────────────────────────────
  const matchesFilter = (s: any) => {
    const query = searchQuery.toLowerCase().trim();
    const days = s.daysOverdue || 0;
    const severity = overdueSeverity(days).label.toLowerCase();

    // Text search: stand number or name
    if (query) {
      const standMatch = (s.standNumber || "").toLowerCase().includes(query);
      const nameMatch = (s.customerName || "").toLowerCase().includes(query);
      const daysMatch = String(days).includes(query);
      if (!standMatch && !nameMatch && !daysMatch) return false;
    }

    // Escalation filter
    if (escalationFilter !== "all") {
      if (escalationFilter === "critical" && days < 30) return false;
      if (escalationFilter === "high" && (days < 10 || days >= 30)) return false;
      if (escalationFilter === "medium" && (days < 4 || days >= 10)) return false;
      if (escalationFilter === "low" && (days < 1 || days >= 4)) return false;
      if (escalationFilter === "current" && days > 0) return false;
    }

    return true;
  };

  const filteredDueToday = useMemo(() => dueToday.filter(matchesFilter), [dueToday, searchQuery, escalationFilter]);
  const filteredOverdue = useMemo(() => overdueAccounts.filter(matchesFilter), [overdueAccounts, searchQuery, escalationFilter]);
  const filteredExtension = useMemo(() => extensionAccounts.filter(matchesFilter), [extensionAccounts, searchQuery, escalationFilter]);

  const hasActiveFilters = searchQuery !== "" || escalationFilter !== "all";

  // ── render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasAccess) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary text-primary-foreground shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <InternalNav isSuperAdmin={isSuperAdmin} isDirector={isDirector} currentPage="collections" />
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/20"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Collections Command Center</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Monthly collection overview &middot; {currentMonthName} {currentYear}
          </p>
        </div>

        {/* ── Filter Bar ───────────────────────────────────────────────── */}
        <Card className="p-3">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative flex-1 w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by stand number, name, or days..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Select value={escalationFilter} onValueChange={setEscalationFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Escalation level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="critical">Critical (30+ days)</SelectItem>
                <SelectItem value="high">High (10-29 days)</SelectItem>
                <SelectItem value="medium">Medium (4-9 days)</SelectItem>
                <SelectItem value="low">Low (1-3 days)</SelectItem>
                <SelectItem value="current">Current</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearchQuery(""); setEscalationFilter("all"); }}
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </Card>

        {/* ── Summary Metrics ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <MetricCard icon={DollarSign} label="Expected This Month" value={fmt(metrics.expectedThisMonth)} />
          <MetricCard icon={TrendingUp} label="Collected" value={fmt(metrics.collectedThisMonth)} accent="text-emerald-600" />
          <MetricCard
            icon={ChevronUp} label="Collection %"
            value={`${metrics.collectionPct.toFixed(1)}%`}
            accent={metrics.collectionPct >= 80 ? "text-emerald-600" : metrics.collectionPct >= 50 ? "text-orange-500" : "text-destructive"}
          />
          <MetricCard icon={Users} label="Standard Outstanding" value={fmt(metrics.standardOutstanding)} />
          <MetricCard icon={Calendar} label="Extension Outstanding" value={fmt(metrics.extensionOutstanding)} />
          <MetricCard icon={AlertTriangle} label="Total Overdue" value={String(metrics.totalOverdue)} accent="text-destructive" />
          <MetricCard icon={ShieldAlert} label="High Risk (30+ days)" value={String(metrics.highRisk)} accent="text-red-900" />
        </div>

        {/* ── Section 1: Due Today ─────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Due Today</h2>
            <Badge variant="secondary" className="ml-auto">{filteredDueToday.length} accounts</Badge>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stand</TableHead>
                      <TableHead>Client Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Monthly Installment</TableHead>
                      <TableHead className="text-right">Days Since Last Payment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDueToday.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          {hasActiveFilters ? "No matching accounts" : "No accounts due today"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredDueToday.map((s: any) => (
                        <TableRow key={s.standNumber}>
                          <TableCell className="font-medium">{s.standNumber}</TableCell>
                          <TableCell>{s.customerName || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {(s.customerCategory || "Standard").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(parseCurrency(s.monthlyPayment))}
                          </TableCell>
                          <TableCell className="text-right">{s.daysSinceLastPayment || "—"}</TableCell>
                          <TableCell>
                            <Badge className="bg-muted text-muted-foreground text-xs">Due</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              <Button size="sm" variant="outline" onClick={() => openOutreach(s, "reminder")}>
                                <Sparkles className="h-3 w-3 mr-1" />
                                Remind
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => openTimeline(s)} title="Timeline">
                                <History className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── Section 2: Overdue ────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h2 className="text-lg font-semibold text-foreground">Overdue</h2>
            <Badge variant="destructive" className="ml-auto">{filteredOverdue.length} accounts</Badge>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stand</TableHead>
                      <TableHead>Client Name</TableHead>
                      <TableHead className="text-right">Amount Outstanding</TableHead>
                      <TableHead className="text-right">Days Overdue</TableHead>
                      <TableHead>Escalation</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOverdue.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          {hasActiveFilters ? "No matching accounts" : "No overdue accounts 🎉"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredOverdue.map((s: any) => {
                        const severity = overdueSeverity(s.daysOverdue || 0);
                        const days = s.daysOverdue || 0;
                        return (
                          <TableRow key={s.standNumber} className={overdueRowClass(days)}>
                            <TableCell className="font-medium">{s.standNumber}</TableCell>
                            <TableCell>{s.customerName || "—"}</TableCell>
                            <TableCell className="text-right font-mono">
                              {fmt(parseCurrency(s.currentBalance))}
                            </TableCell>
                            <TableCell className="text-right font-bold">{days}</TableCell>
                            <TableCell>
                              <Badge className={`${severity.className} text-xs`}>{severity.label}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openOutreach(s, days >= 10 ? "escalation" : "follow_up")}
                                >
                                  <Sparkles className="h-3 w-3 mr-1" />
                                  {days >= 10 ? "Escalate" : "Follow Up"}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => openTimeline(s)} title="Timeline">
                                  <History className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* ── Section 3: Extension Accounts ───────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-5 w-5 text-secondary" />
            <h2 className="text-lg font-semibold text-foreground">Extension Accounts</h2>
            <Badge variant="secondary" className="ml-auto">{filteredExtension.length} accounts</Badge>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stand</TableHead>
                      <TableHead>Client Name</TableHead>
                      <TableHead className="text-right">Monthly Amount</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-right">Days Overdue / Ahead</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExtension.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          {hasActiveFilters ? "No matching accounts" : "No extension accounts"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredExtension.map((s: any) => {
                        const isOverdue = (s.daysOverdue || 0) > 0;
                        const isPrepaid = (s.prepaidDays || 0) > 0;
                        return (
                          <TableRow key={s.standNumber}>
                            <TableCell className="font-medium">{s.standNumber}</TableCell>
                            <TableCell>{s.customerName || "—"}</TableCell>
                            <TableCell className="text-right font-mono">
                              {fmt(parseCurrency(s.monthlyPayment))}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {fmt(parseCurrency(s.currentBalance))}
                            </TableCell>
                            <TableCell className="text-right">
                              {isOverdue ? (
                                <span className="text-destructive font-bold">{s.daysOverdue}d overdue</span>
                              ) : isPrepaid ? (
                                <span className="text-emerald-600">{s.prepaidDays}d ahead</span>
                              ) : (
                                <span className="text-muted-foreground">Current</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {isOverdue ? (
                                <Badge className={`${overdueSeverity(s.daysOverdue).className} text-xs`}>
                                  {overdueSeverity(s.daysOverdue).label}
                                </Badge>
                              ) : isPrepaid ? (
                                <Badge className="bg-emerald-100 text-emerald-800 text-xs">Ahead</Badge>
                              ) : (
                                <Badge className="bg-muted text-muted-foreground text-xs">Current</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex gap-1 justify-end">
                                {isOverdue && (
                                  <Button size="sm" variant="outline" onClick={() => openOutreach(s, "reminder")}>
                                    <Sparkles className="h-3 w-3 mr-1" />
                                    Remind
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" onClick={() => openTimeline(s)} title="Timeline">
                                  <History className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      <BottomNav />

      {/* Outreach Dialog */}
      <OutreachDialog
        open={outreachOpen}
        onOpenChange={setOutreachOpen}
        stand={outreachStand}
        defaultType={outreachType}
      />

      {/* Timeline Panel */}
      <TimelinePanel
        open={timelineOpen}
        onOpenChange={setTimelineOpen}
        stand={timelineStand}
      />
    </div>
  );
};

// ── MetricCard ──────────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: any;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${accent || "text-muted-foreground"}`} />
        <span className="text-[11px] text-muted-foreground leading-tight">{label}</span>
      </div>
      <p className={`text-lg font-bold ${accent || "text-foreground"}`}>{value}</p>
    </Card>
  );
}

export default CollectionsCommandCenter;
