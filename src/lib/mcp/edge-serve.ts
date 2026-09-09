import { createSupabaseHandler } from "@lovable.dev/mcp-js/stacks/supabase";
import { createStandledgerMcp } from "./definition";
import { requestHasLovableApiKey } from "./lovable-api-key";

/**
 * OAuth (customer JWT) by default. When the request carries the project
 * `LOVABLE_API_KEY` as `Authorization: Bearer …` or `Lovable-API-Key`, skip
 * OAuth and serve the same tools for service-role lookups.
 */
export function createMcpFetchHandler(): (request: Request) => Promise<Response> {
  const oauthHandler = createSupabaseHandler(createStandledgerMcp({ oauth: true }), {
    functionName: "mcp",
  });
  const apiKeyHandler = createSupabaseHandler(createStandledgerMcp({ oauth: false }), {
    functionName: "mcp",
  });

  return async (request: Request) => {
    if (requestHasLovableApiKey(request)) {
      return apiKeyHandler(request);
    }
    return oauthHandler(request);
  };
}
