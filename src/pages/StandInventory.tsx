import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { parse } from "csv-parse/sync";
import { supabase } from "@/integrations/supabase/client";
import InternalNav from "@/components/InternalNav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Loader2,
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Upload,
  UserPlus,
  Download,
} from "lucide-react";
import {
  buyerDisplayName,
  formatBuyersShort,
  isAvailableForSaleStatus,
  isOfficiallySoldStatus,
  normalizeStandNumber,
  type StandInventoryBuyerRow,
  type StandWithBuyers,
} from "@/lib/stand-inventory";

type FormBuyer = Omit<
  StandInventoryBuyerRow,
  "id" | "stand_inventory_id" | "created_at" | "updated_at"
> & { id?: string };

type StandFormState = {
  id?: string;
  stand_number: string;
  land_use: string;
  area_sqm: string;
  phase: string;
  rights: string;
  status: string;
  purchase_price: string;
  agreement_requested: string;
  agreement_signed_warwickshire: string;
  agreement_signed_by_client: string;
  buyers: FormBuyer[];
};

const emptyBuyer = (order: number): FormBuyer => ({
  first_name: "",
  surname: "",
  id_number: "",
  phone: "",
  email: "",
  address: "",
  allocation: "",
  sort_order: order,
});

function normHeader(k: string): string {
  return k
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cell(row: Record<string, string>, candidates: string[]): string {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const want = normHeader(cand);
    const hit = keys.find((k) => normHeader(k) === want);
    if (hit !== undefined) {
      return (row[hit] ?? "").toString().trim();
    }
  }
  for (const cand of candidates) {
    const sub = normHeader(cand);
    const hit = keys.find((k) => normHeader(k).includes(sub) || sub.includes(normHeader(k)));
    if (hit !== undefined) {
      return (row[hit] ?? "").toString().trim();
    }
  }
  return "";
}

function parseMoney(raw: string): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseArea(raw: string): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function rowToStandFields(r: Record<string, string>) {
  return {
    stand_number: normalizeStandNumber(
      cell(r, ["Stand Number", "stand number", "Stand No", "Stand #", "stand"])
    ),
    land_use: cell(r, ["Land Use", "land use"]) || null,
    area_sqm: parseArea(cell(r, ["Area (sqm)", "Area", "area (sqm)", "area sqm", "sqm"])),
    phase: cell(r, ["Phase", "phase"]) || null,
    rights: cell(r, ["Rights", "rights"]) || null,
    status: cell(r, ["Status", "status"]) || null,
    purchase_price: parseMoney(cell(r, ["Purchase Price", "purchase price", "price"])),
    agreement_requested: cell(r, ["Agreement Requested", "agreement requested"]) || null,
    agreement_signed_warwickshire:
      cell(r, ["Agreement Signed Warwickshire", "agreement signed warwickshire"]) || null,
    agreement_signed_by_client:
      cell(r, ["Agreement Signed by Client", "Agreement Signed By Client", "agreement signed by client"]) ||
      null,
  };
}

function rowToBuyer(r: Record<string, string>, sort_order: number): FormBuyer {
  return {
    first_name: cell(r, ["First name", "First Name", "first name"]) || "",
    surname:
      cell(r, ["Surname", "surname", "Last name", "Last Name", "last name"]) || "",
    id_number: cell(r, ["ID Number", "Id Number", "id number", "National ID"]) || "",
    phone: cell(r, ["Phone Number", "phone number", "Phone", "Mobile"]) || "",
    email: cell(r, ["Email Address", "email address", "Email"]) || "",
    address: cell(r, ["Address", "address"]) || "",
    allocation: cell(r, ["Allocation", "allocation", "Customer Category", "Category"]) || "",
    sort_order,
  };
}

function hasBuyerDetail(b: FormBuyer): boolean {
  return Boolean(
    b.first_name?.trim() ||
      b.surname?.trim() ||
      b.id_number?.trim() ||
      b.phone?.trim() ||
      b.email?.trim() ||
      b.address?.trim() ||
      b.allocation?.trim()
  );
}

function toFormState(row: StandWithBuyers): StandFormState {
  const buyers =
    (row.stand_inventory_buyer || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((b, i) => ({
        id: b.id,
        first_name: b.first_name ?? "",
        surname: b.surname ?? "",
        id_number: b.id_number ?? "",
        phone: b.phone ?? "",
        email: b.email ?? "",
        address: b.address ?? "",
        allocation: b.allocation ?? "",
        sort_order: b.sort_order ?? i,
      })) || [];

  if (buyers.length === 0) buyers.push(emptyBuyer(0));

  return {
    id: row.id,
    stand_number: row.stand_number,
    land_use: row.land_use ?? "",
    area_sqm: row.area_sqm != null ? String(row.area_sqm) : "",
    phase: row.phase ?? "",
    rights: row.rights ?? "",
    status: row.status ?? "",
    purchase_price: row.purchase_price != null ? String(row.purchase_price) : "",
    agreement_requested: row.agreement_requested ?? "",
    agreement_signed_warwickshire: row.agreement_signed_warwickshire ?? "",
    agreement_signed_by_client: row.agreement_signed_by_client ?? "",
    buyers,
  };
}

const emptyStandForm = (): StandFormState => ({
  stand_number: "",
  land_use: "",
  area_sqm: "",
  phase: "",
  rights: "",
  status: "",
  purchase_price: "",
  agreement_requested: "",
  agreement_signed_warwickshire: "",
  agreement_signed_by_client: "",
  buyers: [emptyBuyer(0)],
});

const StandInventory = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<StandWithBuyers[]>([]);
  const [tenantUuid, setTenantUuid] = useState<string | null>(null);
  const [isInternal, setIsInternal] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isDirector, setIsDirector] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "marketable" | "sold" | "not_sold_other">("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<StandFormState>(emptyStandForm);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("stand_inventory")
      .select("*, stand_inventory_buyer(*)")
      .order("stand_number");

    if (error) {
      console.error(error);
      toast.error("Could not load stand inventory");
      return;
    }

    const list = (data || []) as StandWithBuyers[];
    for (const s of list) {
      s.stand_inventory_buyer = (s.stand_inventory_buyer || []).sort(
        (a, b) => a.sort_order - b.sort_order
      );
    }
    setRows(list);
  }, []);

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate("/internal-login");
        return;
      }

      const { data: iu, error: iuErr } = await supabase
        .from("internal_users")
        .select("id, role")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (iuErr || !iu) {
        toast.error("Internal access only.");
        navigate("/");
        return;
      }

      setIsSuperAdmin(iu.role === "super_admin");
      setIsDirector(iu.role === "admin" || iu.role === "super_admin");
      setIsInternal(true);

      const { data: tenant, error: te } = await supabase
        .from("tenants")
        .select("id")
        .eq("slug", "lakecity")
        .maybeSingle();

      if (te || !tenant) {
        toast.error("Tenant configuration missing.");
        return;
      }
      setTenantUuid(tenant.id);
      await load();
      setLoading(false);
    };
    init();
  }, [navigate, load]);

  useEffect(() => {
    if (!isInternal) return;
    const channel = supabase
      .channel("stand_inventory_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stand_inventory" },
        () => {
          load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isInternal, load]);

  const syncOdooProducts = useCallback(async (standIds: string[], archive = false): Promise<boolean> => {
    if (!standIds.length) return true;
    const body =
      standIds.length === 1
        ? { stand_id: standIds[0], archive }
        : { stand_ids: standIds, archive };
    const { data, error } = await supabase.functions.invoke("sync-stand-odoo-product", { body });
    if (error) {
      console.error(error);
      toast.error("Odoo product sync failed. Deploy sync-stand-odoo-product and set ODOO_ORIGIN + LAKECITY_LOAN_API_TOKEN.");
      return false;
    }
    if (!data?.ok) {
      toast.error(typeof data?.error === "string" ? data.error : "Odoo sync rejected");
      return false;
    }
    return true;
  }, []);

  const stats = useMemo(() => {
    let marketable = 0;
    let sold = 0;
    let other = 0;
    for (const s of rows) {
      if (isOfficiallySoldStatus(s.status)) sold += 1;
      else if (isAvailableForSaleStatus(s.status)) marketable += 1;
      else other += 1;
    }
    return { total: rows.length, marketable, sold, other };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((s) => {
      if (filter === "marketable" && !isAvailableForSaleStatus(s.status)) return false;
      if (filter === "sold" && !isOfficiallySoldStatus(s.status)) return false;
      if (filter === "not_sold_other") {
        if (isOfficiallySoldStatus(s.status) || isAvailableForSaleStatus(s.status)) return false;
      }
      if (!q) return true;
      const buyers = formatBuyersShort(s.stand_inventory_buyer || []).toLowerCase();
      const hay = [
        s.stand_number,
        s.land_use,
        s.phase,
        s.rights,
        s.status,
        buyers,
        ...(s.stand_inventory_buyer || []).flatMap((b) => [
          b.email,
          b.phone,
          b.allocation,
          b.id_number,
        ]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, filter]);

  const openNew = () => {
    setForm(emptyStandForm());
    setDialogOpen(true);
  };

  const openEdit = (s: StandWithBuyers) => {
    setForm(toFormState(s));
    setDialogOpen(true);
  };

  const persistBuyers = async (standId: string, buyers: FormBuyer[]) => {
    const { error: delErr } = await supabase
      .from("stand_inventory_buyer")
      .delete()
      .eq("stand_inventory_id", standId);
    if (delErr) throw delErr;

    const effective = buyers.filter(hasBuyerDetail);
    if (effective.length === 0) return;

    const insertRows = effective.map((b, idx) => ({
      stand_inventory_id: standId,
      first_name: b.first_name.trim() || null,
      surname: b.surname.trim() || null,
      id_number: b.id_number.trim() || null,
      phone: b.phone.trim() || null,
      email: b.email.trim() || null,
      address: b.address.trim() || null,
      allocation: b.allocation.trim() || null,
      sort_order: idx,
    }));

    const { error: insErr } = await supabase.from("stand_inventory_buyer").insert(insertRows);
    if (insErr) throw insErr;
  };

  const saveStand = async () => {
    if (!tenantUuid) return;
    const sn = normalizeStandNumber(form.stand_number);
    if (!sn) {
      toast.error("Stand number is required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantUuid,
        stand_number: sn,
        land_use: form.land_use.trim() || null,
        area_sqm: form.area_sqm.trim() ? parseArea(form.area_sqm) : null,
        phase: form.phase.trim() || null,
        rights: form.rights.trim() || null,
        status: form.status.trim() || null,
        purchase_price: form.purchase_price.trim() ? parseMoney(form.purchase_price) : null,
        agreement_requested: form.agreement_requested.trim() || null,
        agreement_signed_warwickshire: form.agreement_signed_warwickshire.trim() || null,
        agreement_signed_by_client: form.agreement_signed_by_client.trim() || null,
      };

      let standId = form.id;

      if (form.id) {
        const { error } = await supabase.from("stand_inventory").update(payload).eq("id", form.id);
        if (error) throw error;
        await persistBuyers(form.id, form.buyers);
        toast.success("Stand updated.");
      } else {
        const { data, error } = await supabase.from("stand_inventory").insert(payload).select("id").single();
        if (error) throw error;
        standId = data.id;
        await persistBuyers(data.id, form.buyers);
        toast.success("Stand created.");
      }

      setDialogOpen(false);
      await load();
      if (standId) {
        const synced = await syncOdooProducts([standId], false);
        if (!synced) toast.warning("Stand saved locally; Odoo product/stock may be stale.");
        else await load();
      }
    } catch (e: unknown) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Save failed (duplicate stand number?)");
    } finally {
      setSaving(false);
    }
  };

  const deleteStand = async (s: StandWithBuyers) => {
    if (!confirm(`Delete stand ${s.stand_number} and all linked buyers?`)) return;
    const synced = await syncOdooProducts([s.id], true);
    if (!synced) {
      toast.warning("Odoo archive may have failed; continuing with delete.");
    }
    const { error } = await supabase.from("stand_inventory").delete().eq("id", s.id);
    if (error) {
      toast.error("Delete failed");
      return;
    }
    toast.success("Stand removed.");
    await load();
  };

  const exportCsv = () => {
    const headers = [
      "Stand Number",
      "First name",
      "Surname",
      "Land Use",
      "Area (sqm)",
      "Phase",
      "ID Number",
      "Phone Number",
      "Email Address",
      "Address",
      "Agreement Requested",
      "Agreement Signed Warwickshire",
      "Agreement Signed by Client",
      "Status",
      "Rights",
      "Allocation",
      "Purchase Price",
    ];
    const lines: string[][] = [headers];
    for (const s of rows) {
      const buyers =
        (s.stand_inventory_buyer || []).filter(hasBuyerDetail).length > 0
          ? s.stand_inventory_buyer || []
          : [emptyBuyer(0)];
      for (const b of buyers) {
        lines.push([
          s.stand_number,
          b.first_name ?? "",
          b.surname ?? "",
          s.land_use ?? "",
          s.area_sqm != null ? String(s.area_sqm) : "",
          s.phase ?? "",
          b.id_number ?? "",
          b.phone ?? "",
          b.email ?? "",
          b.address ?? "",
          s.agreement_requested ?? "",
          s.agreement_signed_warwickshire ?? "",
          s.agreement_signed_by_client ?? "",
          s.status ?? "",
          s.rights ?? "",
          b.allocation ?? "",
          s.purchase_price != null ? String(s.purchase_price) : "",
        ]);
      }
    }
    const csv = lines.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lakecity-stand-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onCsvFile = async (file: File | null) => {
    if (!file || !tenantUuid) return;
    setImporting(true);
    try {
      const text = await file.text();
      const records = parse(text, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
      }) as Record<string, string>[];

      if (!records.length) {
        toast.error("CSV has no rows.");
        return;
      }

      type Group = {
        stand: ReturnType<typeof rowToStandFields>;
        buyers: FormBuyer[];
      };
      const groups = new Map<string, Group>();

      for (const r of records) {
        const sf = rowToStandFields(r);
        if (!sf.stand_number) continue;
        let g = groups.get(sf.stand_number);
        if (!g) {
          g = { stand: sf, buyers: [] };
          groups.set(sf.stand_number, g);
        } else {
          const prev = g.stand;
          g.stand = {
            ...prev,
            ...Object.fromEntries(
              Object.entries(sf).filter(([k, v]) => {
                if (v == null || v === "") return false;
                const pk = prev[k as keyof typeof prev];
                return pk == null || pk === "";
              })
            ) as typeof sf,
          };
        }
        const buyer = rowToBuyer(r, g.buyers.length);
        if (hasBuyerDetail(buyer)) g.buyers.push(buyer);
      }

      let n = 0;
      const importedIds: string[] = [];
      for (const [, g] of groups) {
        const payload = {
          tenant_id: tenantUuid,
          stand_number: g.stand.stand_number,
          land_use: g.stand.land_use,
          area_sqm: g.stand.area_sqm,
          phase: g.stand.phase,
          rights: g.stand.rights,
          status: g.stand.status,
          purchase_price: g.stand.purchase_price,
          agreement_requested: g.stand.agreement_requested,
          agreement_signed_warwickshire: g.stand.agreement_signed_warwickshire,
          agreement_signed_by_client: g.stand.agreement_signed_by_client,
        };

        const { data, error } = await supabase
          .from("stand_inventory")
          .upsert(payload, { onConflict: "tenant_id,stand_number" })
          .select("id")
          .single();

        if (error) throw error;

        importedIds.push(data.id);

        const { error: delErr } = await supabase
          .from("stand_inventory_buyer")
          .delete()
          .eq("stand_inventory_id", data.id);
        if (delErr) throw delErr;

        if (g.buyers.length) {
          const insertRows = g.buyers.map((b, idx) => ({
            stand_inventory_id: data.id,
            first_name: b.first_name.trim() || null,
            surname: b.surname.trim() || null,
            id_number: b.id_number.trim() || null,
            phone: b.phone.trim() || null,
            email: b.email.trim() || null,
            address: b.address.trim() || null,
            allocation: b.allocation.trim() || null,
            sort_order: idx,
          }));
          const { error: insErr } = await supabase.from("stand_inventory_buyer").insert(insertRows);
          if (insErr) throw insErr;
        }

        n += 1;
      }

      toast.success(`Imported / updated ${n} stand(s).`);
      await load();
      if (importedIds.length) {
        const CHUNK = 400;
        let allOk = true;
        for (let i = 0; i < importedIds.length; i += CHUNK) {
          const chunk = importedIds.slice(i, i + CHUNK);
          const ok = await syncOdooProducts(chunk, false);
          if (!ok) allOk = false;
        }
        if (!allOk) toast.warning("CSV saved; some Odoo product batches may have failed.");
        else await load();
      }
    } catch (e: unknown) {
      console.error(e);
      toast.error("CSV import failed.");
    } finally {
      setImporting(false);
    }
  };

  if (!isInternal || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="bg-primary text-primary-foreground p-4 md:p-6 shadow-lg">
        <div className="max-w-[1600px] mx-auto flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
          <div>
            <h1 className="text-xl md:text-3xl font-bold flex items-center gap-2 text-primary-foreground">
              <MapPin className="h-7 w-7 md:h-8 md:w-8" />
              Stand inventory
            </h1>
            <p className="text-sm md:text-base text-primary-foreground/80 mt-1">
              Authoritative Lake City stands register — one row per stand; shared purchases use multiple buyers.
            </p>
          </div>
          <InternalNav
            isSuperAdmin={isSuperAdmin}
            isDirector={isDirector}
            currentPage="stand-inventory"
          />
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto p-4 md:p-6 space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total stands</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-green-600/30 bg-green-50/50 dark:bg-green-950/20">
            <CardHeader className="pb-2">
              <CardDescription>Available to sell</CardDescription>
              <CardTitle className="text-3xl tabular-nums text-green-700 dark:text-green-400">
                {stats.marketable}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground pt-0">
              Blank or “Available” status, and not containing “Sold”.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Officially sold</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{stats.sold}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground pt-0">
              Status contains “Sold” (case-insensitive).
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Reserved / other (not sold)</CardDescription>
              <CardTitle className="text-3xl tabular-nums">{stats.other}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground pt-0">
              Not sold, but not marketable (e.g. reserved).
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle>Stands</CardTitle>
              <CardDescription>
                Status drives sold vs unsold; only blank or Available (without Sold) are offered for sale. Each stand maps
                to one Odoo Sales product; stock is 1 unit when marketable and 0 otherwise (synced on save). Enable
                Supabase Realtime on <code className="text-xs">stand_inventory</code> so open sessions refresh live.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Search stand, buyer, phone, email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-[220px] lg:w-[280px]"
              />
              <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stands</SelectItem>
                  <SelectItem value="marketable">Available to sell</SelectItem>
                  <SelectItem value="sold">Officially sold</SelectItem>
                  <SelectItem value="not_sold_other">Not sold (other status)</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                disabled={importing}
                onChange={(e) => {
                  onCsvFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={importing}
                onClick={() => csvInputRef.current?.click()}
              >
                {importing ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-1" />
                )}
                Import CSV
              </Button>
              <Button size="sm" onClick={openNew}>
                <Plus className="h-4 w-4 mr-1" />
                Add stand
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="w-full border rounded-md max-h-[min(70vh,900px)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stand</TableHead>
                    <TableHead>Buyers</TableHead>
                    <TableHead>Land use</TableHead>
                    <TableHead className="text-right">Area (sqm)</TableHead>
                    <TableHead>Phase</TableHead>
                    <TableHead>Rights</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="whitespace-nowrap">Odoo</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-12">
                        No stands match this view. Add a stand or adjust filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((s) => {
                      const sold = isOfficiallySoldStatus(s.status);
                      const market = isAvailableForSaleStatus(s.status);
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono font-medium">{s.stand_number}</TableCell>
                          <TableCell className="max-w-[220px]">
                            <div className="text-sm leading-snug">
                              {(s.stand_inventory_buyer || []).length ? (
                                (s.stand_inventory_buyer || []).map((b) => (
                                  <div key={b.id}>
                                    {buyerDisplayName(b)}
                                    {b.allocation ? (
                                      <span className="text-muted-foreground"> · {b.allocation}</span>
                                    ) : null}
                                  </div>
                                ))
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{s.land_use ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {s.area_sqm != null ? s.area_sqm : "—"}
                          </TableCell>
                          <TableCell>{s.phase ?? "—"}</TableCell>
                          <TableCell className="max-w-[160px] truncate" title={s.rights ?? ""}>
                            {s.rights ?? "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant={sold ? "default" : market ? "secondary" : "outline"}>
                                {s.status?.trim() || "—"}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {s.purchase_price != null ? s.purchase_price : "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            {s.odoo_product_id ? (
                              <Badge variant="outline" className="font-normal" title={s.odoo_synced_at ?? ""}>
                                #{s.odoo_product_id}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(s)} aria-label="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => deleteStand(s)}
                              aria-label="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit stand" : "New stand"}</DialogTitle>
            <DialogDescription>
              Stand number is unique per estate. Add multiple buyers for shared purchases; allocation is the CRM
              customer category.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Label htmlFor="sn">Stand number</Label>
                <Input
                  id="sn"
                  className="font-mono"
                  value={form.stand_number}
                  disabled={!!form.id}
                  onChange={(e) => setForm({ ...form, stand_number: e.target.value })}
                />
              </div>
              <div>
                <Label>Land use</Label>
                <Input value={form.land_use} onChange={(e) => setForm({ ...form, land_use: e.target.value })} />
              </div>
              <div>
                <Label>Area (sqm)</Label>
                <Input
                  value={form.area_sqm}
                  onChange={(e) => setForm({ ...form, area_sqm: e.target.value })}
                  inputMode="decimal"
                />
              </div>
              <div>
                <Label>Phase</Label>
                <Input value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })} />
              </div>
              <div>
                <Label>Rights</Label>
                <Input value={form.rights} onChange={(e) => setForm({ ...form, rights: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Status</Label>
                <Input
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  placeholder="e.g. Available, Sold — Cash, Reserved…"
                />
              </div>
              <div className="col-span-2">
                <Label>Purchase price</Label>
                <Input
                  value={form.purchase_price}
                  onChange={(e) => setForm({ ...form, purchase_price: e.target.value })}
                  inputMode="decimal"
                />
              </div>
              <div className="col-span-2">
                <Label>Agreement requested</Label>
                <Input
                  value={form.agreement_requested}
                  onChange={(e) => setForm({ ...form, agreement_requested: e.target.value })}
                />
              </div>
              <div>
                <Label>Agreement signed (Warwickshire)</Label>
                <Input
                  value={form.agreement_signed_warwickshire}
                  onChange={(e) => setForm({ ...form, agreement_signed_warwickshire: e.target.value })}
                />
              </div>
              <div>
                <Label>Agreement signed (client)</Label>
                <Input
                  value={form.agreement_signed_by_client}
                  onChange={(e) => setForm({ ...form, agreement_signed_by_client: e.target.value })}
                />
              </div>
            </div>

            <div className="border-t pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Buyers</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm({
                      ...form,
                      buyers: [...form.buyers, emptyBuyer(form.buyers.length)],
                    })
                  }
                >
                  <UserPlus className="h-4 w-4 mr-1" />
                  Co-buyer
                </Button>
              </div>
              {form.buyers.map((b, idx) => (
                <div key={idx} className="rounded-md border p-3 space-y-2 bg-muted/30">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-muted-foreground">Buyer {idx + 1}</span>
                    {form.buyers.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-destructive"
                        onClick={() =>
                          setForm({
                            ...form,
                            buyers: form.buyers.filter((_, i) => i !== idx),
                          })
                        }
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">First name</Label>
                      <Input
                        value={b.first_name}
                        onChange={(e) => {
                          const buyers = [...form.buyers];
                          buyers[idx] = { ...b, first_name: e.target.value };
                          setForm({ ...form, buyers });
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Surname</Label>
                      <Input
                        value={b.surname}
                        onChange={(e) => {
                          const buyers = [...form.buyers];
                          buyers[idx] = { ...b, surname: e.target.value };
                          setForm({ ...form, buyers });
                        }}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">ID number</Label>
                      <Input
                        value={b.id_number}
                        onChange={(e) => {
                          const buyers = [...form.buyers];
                          buyers[idx] = { ...b, id_number: e.target.value };
                          setForm({ ...form, buyers });
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Phone</Label>
                      <Input
                        value={b.phone}
                        onChange={(e) => {
                          const buyers = [...form.buyers];
                          buyers[idx] = { ...b, phone: e.target.value };
                          setForm({ ...form, buyers });
                        }}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Email</Label>
                      <Input
                        value={b.email}
                        onChange={(e) => {
                          const buyers = [...form.buyers];
                          buyers[idx] = { ...b, email: e.target.value };
                          setForm({ ...form, buyers });
                        }}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Address</Label>
                      <Textarea
                        rows={2}
                        value={b.address}
                        onChange={(e) => {
                          const buyers = [...form.buyers];
                          buyers[idx] = { ...b, address: e.target.value };
                          setForm({ ...form, buyers });
                        }}
                      />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Allocation (CRM category)</Label>
                      <Input
                        value={b.allocation}
                        onChange={(e) => {
                          const buyers = [...form.buyers];
                          buyers[idx] = { ...b, allocation: e.target.value };
                          setForm({ ...form, buyers });
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveStand} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StandInventory;
