import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProfile from "./tools/get-my-profile";
import getMyStatements from "./tools/get-my-statements";

// Build the OAuth issuer from the project ref so the URL survives publish and
// matches the direct supabase.co host that Supabase's discovery document
// advertises (mcp-js rejects tokens whose issuer disagrees).
const projectRef =
  import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "standledger-mcp",
  title: "StandLedger Customer Portal",
  version: "0.1.0",
  instructions:
    "Tools for the StandLedger customer portal (Warwickshire Pvt Ltd / Lake City). Each caller acts as the signed-in customer; all reads are scoped to that customer's stand under RLS. Use `get_my_profile` to look up the caller's stand and contact details, and `get_my_statements` to fetch their monthly account statements.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyProfile, getMyStatements],
});
