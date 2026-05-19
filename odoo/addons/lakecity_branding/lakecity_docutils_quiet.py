# -*- coding: utf-8 -*-
"""Silence docutils stderr spam during Odoo Apps description RST rendering.

Odoo's ``ir.module.module._get_desc`` uses ``from docutils.core import publish_string``
inside ``odoo.addons.base.models.ir_module``, which binds the function object once.
Patching only ``docutils.core.publish_string`` leaves that binding stale; patching only
``ir_module.publish_string`` misses callers that use the qualified name.

Docutils may emit "(ERROR/3) Unexpected indentation" on stderr even when it still
returns HTML. ``contextlib.redirect_stderr`` is not always enough if streams were
captured earlier, so we temporarily replace ``sys.stderr`` during the call.
"""

_APPLIED = False


def apply_patch():
    global _APPLIED
    if _APPLIED:
        return
    try:
        import docutils.core as _dc
    except ImportError:
        return
    try:
        from odoo.addons.base.models import ir_module as _ir_module_mod
    except Exception:
        _ir_module_mod = None

    _orig = _dc.publish_string

    def publish_string(*args, **kwargs):
        import sys
        from io import StringIO

        buf = StringIO()
        old_stderr = sys.stderr
        sys.stderr = buf
        try:
            return _orig(*args, **kwargs)
        finally:
            sys.stderr = old_stderr

    _dc.publish_string = publish_string
    if _ir_module_mod is not None:
        _ir_module_mod.publish_string = publish_string

    _APPLIED = True
