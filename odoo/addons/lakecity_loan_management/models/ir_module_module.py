# -*- coding: utf-8 -*-
"""Customize Apps description rendering for this addon.

Odoo falls back to docutils (RST) when static/description/index.html is missing.
On some hosts the HTML file resolves inconsistently; Markdown or stale multi-line
descriptions then produce noisy stderr: "(ERROR/3) Unexpected indentation".

For lakecity_loan_management only, skip RST entirely and render plain HTML.
"""

import logging
import os

import lxml.html
from markupsafe import escape

from odoo import api, models
from odoo.tools import file_open, html_sanitize

_logger = logging.getLogger(__name__)

LAKECITY_LOAN_MODULE = "lakecity_loan_management"


class IrModuleModule(models.Model):
    _inherit = "ir.module.module"

    def _lakecity_plain_description_html(self, module):
        text = (module.description or "").strip()
        if not text:
            return False
        return html_sanitize(f"<p>{escape(text)}</p>")

    def _lakecity_description_html_from_index(self, module):
        path = os.path.join(module.name, "static/description/index.html")
        with file_open(path, "rb") as desc_file:
            doc = desc_file.read().decode()
        html = lxml.html.document_fromstring(doc)
        for element, _attribute, _link, _pos in html.iterlinks():
            src = element.get("src")
            if src and "//" not in src and "static/" not in src:
                element.set("src", "/%s/static/description/%s" % (module.name, src))
        return html_sanitize(lxml.html.tostring(html, encoding="unicode"))

    @api.depends("name", "description")
    def _get_desc(self):
        ours = self.filtered(lambda m: m.name == LAKECITY_LOAN_MODULE)
        rest = self - ours
        if rest:
            super(IrModuleModule, rest)._get_desc()
        for module in ours:
            if not module.name:
                module.description_html = False
                continue
            try:
                module.description_html = self._lakecity_description_html_from_index(module)
            except FileNotFoundError:
                module.description_html = self._lakecity_plain_description_html(module)
            except Exception as err:  # noqa: BLE001
                _logger.warning(
                    "Lakecity: module description HTML fallback for %s: %s",
                    module.name,
                    err,
                )
                module.description_html = self._lakecity_plain_description_html(module)
