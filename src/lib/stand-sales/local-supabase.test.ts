import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { handleGatewayReturn, startCardPayment } from "../../../supabase/functions/_shared/stand-sales-service.ts";
import { createSupabaseStore, lakecityTenantId } from "../../../supabase/functions/_shared/stand-sales-store.ts";
import type { IveriConfig } from "../../../supabase/functions/_shared/iveri.ts";

const url = process.env.LOCAL_SUPABASE_URL ?? "";
const key = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY ?? "";
const local = Boolean(url && key) && /127\.0\.0\.1|localhost/.test(url) && !url.includes("gumkxjeahojrcaqnosyz");

describe.skipIf(!local)("stand sales against local Supabase", () => {
  let server: ReturnType<typeof createServer> | null = null;
  let port = 0;
  const answers = new Map<string, string>();

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it("confirms a mocked AuthoriseInfo status 0 for exactly USD 2,250 and queues email without sending it", async () => {
    server = createServer((req, res) => {
      const trace = new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get("trace")
        ?? "";
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        const params = new URLSearchParams(body);
        const reference = params.get("Lite_Merchant_Trace") || trace;
        const html = answers.get(reference) ?? `<input name="Lite_Payment_Card_Status" value="">`;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;

    const db = createClient(url, key, { auth: { persistSession: false } });
    const client = db as unknown as Parameters<typeof createSupabaseStore>[0];
    const store = createSupabaseStore(client, await lakecityTenantId(client));
    const config: IveriConfig = {
      environment: "test",
      applicationId: "00000000-0000-4000-8000-000000000001",
      sharedSecret: null,
      gatewayUrl: `http://127.0.0.1:${port}/Lite/Authorise.aspx`,
      authoriseInfoUrl: `http://127.0.0.1:${port}/Lite/AuthoriseInfo.aspx`,
      simulations: true,
    };
    const available = (await store.listStands()).find((stand) => stand.available && stand.sizeSqm);
    if (!available) throw new Error("no available stand in local inventory");
    const created = await store.insertApplication({
      standInventoryId: (await store.standByNumber(available.standNumber))!.id,
      standNumber: available.standNumber,
      fullName: "Tariro Moyo",
      email: "tariro.wizard@example.com",
      phone: "+263771110000",
      accessTokenHash: "local-test-hash",
    });
    await store.saveOffer(created.id, { idNumber: "63-000000A00", address: "1 Lake Road", nextOfKin: "Rudo Moyo", signature: "Tariro Moyo", accepted: true }, new Date().toISOString());
    const app = (await store.getApplication(created.id))!;
    const token = "not-used";
    const started = await startCardPayment({
      store: {
        ...store,
        getApplication: async (id) => {
          const row = await store.getApplication(id);
          return row ? { ...row, accessTokenHash: await (await import("../../../supabase/functions/_shared/stand-sales-service.ts")).sha256Hex(token) } : null;
        },
      },
      config,
      applicationId: app.id,
      accessToken: token,
      returnUrl: `http://127.0.0.1:${port}/return`,
    });
    expect(started.reference).toMatch(new RegExp(`^LC${available.standNumber}-`));
    expect(started.fields?.Lite_Order_Amount).toBe("225000");
    const nonce = started.fields?.LC_Nonce ?? "";
    answers.set(started.reference!, `<input name="Lite_Payment_Card_Status" value="0"><input name="Lite_Order_Amount" value="225000"><input name="Lite_Currency_AlphaCode" value="USD"><input name="Lite_Merchant_Trace" value="${started.reference}"><input name="MerchantReference" value="${started.reference}"><input name="LC_Nonce" value="${nonce}">`);
    const outcome = await handleGatewayReturn({ store, config, reference: started.reference! });
    expect(outcome?.result).toBe("approved");
    expect(outcome?.applied).toBe("applied");
    const paid = await store.getApplication(created.id);
    expect(paid?.stage).toBe("paid");
    expect(paid?.paymentAmountCents).toBe(225000);
    const { count } = await db.from("stand_sales_email_outbox").select("id", { count: "exact", head: true }).eq("application_id", created.id).eq("status", "queued_dev_only");
    expect(count).toBeGreaterThan(0);
    const stand = await store.standByNumber(available.standNumber);
    expect(stand?.available).toBe(false);
  });
});
