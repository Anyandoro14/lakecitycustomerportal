# Commercial Cursor Cloud Agent deployment (LakeCity Portal)

This checklist moves LakeCity from personal one-off Cloud Agents to a **team-ready commercial** setup: shared environment, secrets, spend controls, and optional Automations / Bugbot.

Your current environment is **Personal** (`Anyandoro14/lakecitycustomerportal`). Commercial use means upgrading to **Teams** (or Enterprise) and promoting a shared environment.

## What “commercial” means here

| Capability | Product | Minimum plan |
|------------|---------|--------------|
| Shared team agents & privacy controls | **Teams** | Teams Standard ($40/user/mo) or Premium |
| Cloud Agents (VM → branch → PR) | **Cloud Agents** | Any paid plan |
| Scheduled / event-driven agents | **Automations** | Paid; Team Owned for org workflows |
| Automated PR review | **Bugbot** (+ optional Autofix) | Usage-based; team features on Teams+ |
| Programmatic agents | **Cloud Agents API / SDK** | API keys; service accounts on Enterprise |
| Agents on your infra | **Self-Hosted Pool** | Enterprise |

Docs: [Cloud Agents](https://cursor.com/docs/cloud-agent.md) · [Setup](https://cursor.com/docs/cloud-agent/setup.md) · [Automations](https://cursor.com/docs/cloud-agent/automations.md) · [Teams pricing](https://cursor.com/docs/account/teams/pricing.md)

## Phase 1 — Team & billing

1. Create or upgrade a team: [cursor.com/team/new-team](https://cursor.com/team/new-team) or Dashboard → Upgrade to Teams.
2. Invite engineers; assign Standard or Premium seats.
3. Enforce **Privacy Mode** (not Legacy Privacy Mode — Legacy blocks Cloud Agents).
4. Set **spend limits** and alerts: [Billing](https://cursor.com/dashboard/billing) · [Usage](https://cursor.com/dashboard/usage).
5. Optional: enable SSO (SAML/OIDC) for the company domain.

## Phase 2 — GitHub integration

1. Open [Integrations](https://cursor.com/dashboard/integrations) → Connect **GitHub**.
2. Grant **read-write** on `Anyandoro14/lakecitycustomerportal` (and any dependent repos).
3. Confirm teammates have GitHub access to the same repo (required to open agent PRs / agent URLs).

## Phase 3 — Shared Cloud Agent environment

Repo already includes:

- `AGENTS.md` — how to run Vite + local Supabase on Cloud VMs
- `.cursor/environment.json` — `npm ci` on every agent boot (cached after first run)

Do this in the dashboard:

1. Open [Cloud Agents → Environments](https://cursor.com/dashboard/cloud-agents#environments).
2. Run **Agent-driven setup** for this repo (~10 minutes): install deps, verify `npm run build`, optionally start Docker for Supabase.
3. **Save the snapshot** to the **Team** (not only Personal).
4. Copy the snapshot ID into `.cursor/environment.json`:

```json
{
  "snapshot": "snapshot-YYYYMMDD-…",
  "install": "npm ci"
}
```

5. Set **Default repository** = this repo, **Base branch** = `main` (or `staging` if that is your integration branch).
6. Add **Runtime Secrets** (never commit these):
   - Staging / hosted Supabase URL + anon key (if agents should hit cloud instead of local)
   - Any Odoo / Google / deploy tokens agents need for the tasks you will assign
7. Configure network policy: start with **Allow all** for onboarding; tighten to an allowlist once workflows are stable (npm registry, Supabase, GitHub, Docker Hub, etc.).

Environment resolution order (highest wins):

1. Repo `.cursor/environment.json`
2. Personal saved environment
3. Team saved environment

## Phase 4 — Team workflows

1. Create **Team Owned** Automations at [cursor.com/automations](https://cursor.com/automations), for example:
   - PR opened → review / checklist
   - CI failed → triage and fix PR
   - Cron → dependency or docs hygiene
2. Templates: [marketplace/automations](https://cursor.com/marketplace/automations).
3. Publish shared Rules / Skills at [Team content](https://cursor.com/dashboard/team-content).
4. Optional: enable [Bugbot](https://cursor.com/dashboard/bugbot) on the repo; prefer Autofix → **Create New Branch**.
5. Decide **Team follow-ups** policy (who can continue another user’s agent).

## Phase 5 — Acceptance test

From [cursor.com/agents](https://cursor.com/agents), start an agent on this repo with a prompt such as:

> Run `npm ci` and `npm run build`. Summarize any failures. Do not change product code unless build is broken.

Confirm:

- [ ] Environment installs without manual intervention
- [ ] Agent can open a PR on the default branch
- [ ] A teammate on the same Cursor team can open the agent URL
- [ ] Secrets are present; network policy does not block npm / Supabase
- [ ] Usage appears under the **team** billing pool

For full-stack tasks, follow `AGENTS.md` (`npm run test:env:setup`, `npm run dev:test`, Edge Functions). Docker on Cloud VMs may need `dockerd` + `fuse-overlayfs` as documented there.

## Phase 6 — Optional advanced

| Need | Where |
|------|--------|
| API-driven agents | [API Keys](https://cursor.com/dashboard/api) → `POST https://api.cursor.com/v1/agents` |
| Self-hosted workers | Enterprise — [Self-Hosted Pool](https://cursor.com/docs/cloud-agent/self-hosted-guides/pool.md) |
| Sales / custom limits | [Contact sales](https://cursor.com/contact-sales) |

## LakeCity-specific notes

- UI-only work: `npm run dev` against hosted Supabase fallbacks in `vite.config.ts` is enough.
- Dashboard / Edge Function work: prefer local Supabase via `npm run test:env:setup` + `npm run test:env:serve-functions` (Docker required).
- Odoo addons under `odoo/addons/` deploy on Odoo.sh — not started from this Cloud Agent environment unless you add that tooling intentionally.
- Prefer human review of all agent PRs; use Bugbot as a second pass, not a merge gate alone.

## Dashboard quick links

| Link | Purpose |
|------|---------|
| https://cursor.com/agents | Start / monitor Cloud Agents |
| https://cursor.com/dashboard/cloud-agents | Environments, secrets, defaults |
| https://cursor.com/automations | Automations |
| https://cursor.com/dashboard/integrations | GitHub / Slack / Linear |
| https://cursor.com/dashboard/bugbot | Bugbot |
| https://cursor.com/dashboard/usage | Usage |
| https://cursor.com/dashboard/billing | Billing & spend limits |
