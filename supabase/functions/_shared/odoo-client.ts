import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

export interface OdooConfig {
  url: string;
  db: string;
  uid: number;
  apiKey: string;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: { message: string; code: number; data?: any };
}

// Load Odoo credentials from Supabase Vault for a given tenant
export async function getOdooConfig(tenantId: string): Promise<OdooConfig> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const secrets = ['odoo_url', 'odoo_db', 'odoo_api_key', 'odoo_uid'];
  const config: Record<string, string> = {};

  for (const key of secrets) {
    const vaultKey = `${key}_${tenantId}`;
    const { data, error } = await supabase.rpc('vault_read_secret', { secret_name: vaultKey });
    if (error || !data) {
      throw new Error(`Missing Vault secret: ${vaultKey}`);
    }
    config[key] = data;
  }

  return {
    url: config.odoo_url,
    db: config.odoo_db,
    uid: parseInt(config.odoo_uid, 10),
    apiKey: config.odoo_api_key,
  };
}

// Low-level JSON-RPC call to Odoo
async function jsonRpc(odooUrl: string, service: string, method: string, args: any[]): Promise<any> {
  const response = await fetch(`${odooUrl}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'call',
      params: { service, method, args },
    }),
  });

  if (!response.ok) {
    throw new Error(`Odoo HTTP error: ${response.status} ${response.statusText}`);
  }

  const data: JsonRpcResponse = await response.json();
  if (data.error) {
    throw new Error(`Odoo RPC error: ${data.error.message}`);
  }

  return data.result;
}

// Authenticate with Odoo (used for initial setup/validation, not for regular API calls)
export async function odooAuth(config: OdooConfig): Promise<number> {
  const uid = await jsonRpc(config.url, 'common', 'authenticate', [
    config.db, '', config.apiKey, {},
  ]);
  return uid;
}

// Search and read records from Odoo
export async function odooSearchRead(
  model: string,
  domain: any[],
  fields: string[],
  config: OdooConfig,
  options: { limit?: number; offset?: number; order?: string } = {}
): Promise<any[]> {
  return jsonRpc(config.url, 'object', 'execute_kw', [
    config.db, config.uid, config.apiKey,
    model, 'search_read',
    [domain],
    { fields, ...options },
  ]);
}

// Create a record in Odoo
export async function odooCreate(
  model: string,
  values: Record<string, any>,
  config: OdooConfig
): Promise<number> {
  return jsonRpc(config.url, 'object', 'execute_kw', [
    config.db, config.uid, config.apiKey,
    model, 'create',
    [values],
    {},
  ]);
}

// Update a record in Odoo
export async function odooWrite(
  model: string,
  ids: number[],
  values: Record<string, any>,
  config: OdooConfig
): Promise<boolean> {
  return jsonRpc(config.url, 'object', 'execute_kw', [
    config.db, config.uid, config.apiKey,
    model, 'write',
    [ids, values],
    {},
  ]);
}
