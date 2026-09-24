# -*- coding: utf-8 -*-
{
    "name": "LakeCity Branding",
    "version": "19.0.1.0.4",
    "summary": "LakeCity ERP theming aligned with portal / StandLedger visual language.",
    "author": "Lakecity",
    "license": "LGPL-3",
    "category": "Hidden",
    "depends": ["web", "lakecity_docutils_patch"],
    "data": [
        "views/lakecity_branding_templates.xml",
    ],
    "assets": {
        "web._assets_primary_variables": [
            (
                "before",
                "web/static/src/scss/primary_variables.scss",
                "lakecity_branding/static/src/scss/lakecity_primary_prepends.scss",
            ),
        ],
        "web.assets_frontend": [
            (
                "after",
                "web/static/src/scss/pre_variables.scss",
                "lakecity_branding/static/src/scss/lakecity_frontend_bs_bridge.scss",
            ),
            (
                "after",
                "web/static/src/scss/base_frontend.scss",
                "lakecity_branding/static/src/scss/lakecity_frontend_misc.scss",
            ),
        ],
    },
    "installable": True,
    "application": False,
}
