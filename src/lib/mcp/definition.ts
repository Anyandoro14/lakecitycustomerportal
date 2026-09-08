import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProfile from "./tools/get-my-profile";
import getMyStatements from "./tools/get-my-statements";
import getPaymentSchedule from "./tools/get-payment-schedule";
import getPayoffProjection from "./tools/get-payoff-projection";
import getMyPaymentBehaviour from "./tools/get-my-payment-behaviour";

const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "gumkxjeahojrcaqnosyz";

const tools = [
  getMyProfile,
  getMyStatements,
  getPaymentSchedule,
  getPayoffProjection,
  getMyPaymentBehaviour,
];

const instructions =
  "Tools for the StandLedger customer portal (Warwickshire Pvt Ltd / Lake City). " +
  "Callers authenticate with a customer OAuth JWT or the project LOVABLE_API_KEY. " +
  "Customer JWTs are RLS-scoped to that customer's stand. LOVABLE_API_KEY calls are " +
  "service-role lookups and require stand_number (or email on get_my_profile). " +
  "All money figures come from the Collection Schedule ledger in USD.";

export function createStandledgerMcp(options: { oauth: boolean }) {
  return defineMcp({
    name: "standledger-mcp",
    title: "StandLedger Customer Portal",
    version: "0.1.0",
    instructions,
    auth: options.oauth
      ? auth.oauth.issuer({
          issuer: `https://${projectRef}.supabase.co/auth/v1`,
          acceptedAudiences: "authenticated",
        })
      : undefined,
    tools,
  });
}

export default createStandledgerMcp({ oauth: true });
