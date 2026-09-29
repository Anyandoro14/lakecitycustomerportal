# -*- coding: utf-8 -*-
"""Form 'Deposited to:' → LakeCity COA liquidity account mapping.

Mirrors scripts/lib/deposited-to-liquidity.mjs — keep labels/codes in sync.
"""
import re

from odoo import api, models

# Exact Form dropdown labels → preferred COA code + name match strategy.
DEPOSITED_TO_COA = {
    "Cash": {
        "code": "101416",
        "name": "Cash",
        "match": "exact",
        "tokens": (),
    },
    "Cabs": {
        "code": "101410",
        "name": "CABS - Main USD Current Account - 1129888509",
        "match": "fuzzy",
        "tokens": ("cabs", "usd", "current"),
    },
    "Cabs Zig": {
        "code": "101411",
        "name": "CABS - Main ZiG Current Account - 1003526446",
        "match": "fuzzy",
        "tokens": ("cabs", "zig", "current"),
    },
    "Jumpstart": {
        "code": "101418",
        "name": "Jumpstart (CAD)",
        "match": "exact",
        "tokens": (),
    },
    "Ecocash": {
        "code": "101417",
        "name": "Ecocash USD",
        "match": "exact",
        "tokens": (),
    },
}

DEPOSITED_TO_LABELS = tuple(DEPOSITED_TO_COA.keys())


class LakecityDepositedToMixin(models.AbstractModel):
    _name = "lakecity.deposited.to.mixin"
    _description = "Deposited-to liquidity mapping helpers"

    @api.model
    def _lakecity_normalize_deposited_to_label(self, raw):
        s = re.sub(r"\s+", " ", str(raw or "").strip()).rstrip(":")
        if not s:
            return ""
        lower = s.lower()
        for label in DEPOSITED_TO_LABELS:
            if label.lower() == lower:
                return label
        aliases = {
            "cabs zig": "Cabs Zig",
            "cabs zi g": "Cabs Zig",
            "eco cash": "Ecocash",
            "eco-cash": "Ecocash",
            "jump start": "Jumpstart",
        }
        return aliases.get(lower, "")

    @api.model
    def _lakecity_deposited_to_mapping(self, raw):
        label = self._lakecity_normalize_deposited_to_label(raw)
        if not label:
            return False
        meta = DEPOSITED_TO_COA.get(label)
        if not meta:
            return False
        return {"label": label, **meta}

    @api.model
    def _lakecity_score_account_for_deposited_to(self, account, mapping):
        if not mapping or not account:
            return -1
        name = (account.name or "").strip()
        if not name:
            return -1
        preferred = mapping.get("name") or ""
        if name == preferred:
            return 1000
        if mapping.get("match") == "exact":
            return 900 if name.lower() == preferred.lower() else -1
        hay = name.lower()
        tokens = mapping.get("tokens") or ()
        if not tokens:
            return -1
        score = 0
        for token in tokens:
            if token.lower() not in hay:
                return -1
            score += 100
        code = mapping.get("code") or ""
        if code and code in (account.code or ""):
            score += 50
        return score

    @api.model
    def _lakecity_find_liquidity_account_for_deposited_to(self, deposited_to, company=None):
        """Return account.account matching Form deposited_to, or empty recordset."""
        mapping = self._lakecity_deposited_to_mapping(deposited_to)
        if not mapping:
            return self.env["account.account"]
        company = company or self.env.company
        Account = self.env["account.account"].sudo()
        domain_company = (
            [("company_ids", "in", company.id)]
            if "company_ids" in Account._fields
            else [("company_id", "=", company.id)]
        )
        # Prefer exact code from COA.
        by_code = Account.search(domain_company + [("code", "=", mapping["code"])], limit=1)
        if by_code:
            return by_code
        # Fallback: name / fuzzy tokens among bank & cash-like asset accounts.
        candidates = Account.search(
            domain_company
            + [
                ("account_type", "in", ("asset_cash", "asset_current")),
            ]
        )
        best = Account.browse()
        best_score = -1
        for acc in candidates:
            score = self._lakecity_score_account_for_deposited_to(acc, mapping)
            if score > best_score:
                best_score = score
                best = acc
        return best if best_score >= 0 else Account.browse()

    @api.model
    def _lakecity_find_journal_for_liquidity_account(self, account, company=None):
        """Prefer an existing bank/cash journal whose default account is ``account``."""
        if not account:
            return self.env["account.journal"]
        company = company or self.env.company
        Journal = self.env["account.journal"].sudo()
        journal = Journal.search(
            [
                ("company_id", "=", company.id),
                ("type", "in", ("bank", "cash")),
                ("default_account_id", "=", account.id),
            ],
            limit=1,
        )
        return journal
