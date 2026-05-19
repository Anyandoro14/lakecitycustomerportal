# -*- coding: utf-8 -*-
"""Silence docutils stderr spam during Odoo Apps description RST rendering.

Odoo's ``ir.module.module._get_desc`` passes manifest text through docutils.
The RST parser reports "Unexpected indentation" via ``Reporter.system_message``,
which writes to ``Reporter.stream`` (default: ``sys.stderr`` wrapped in
``ErrorOutput``). That happens inside docutils even when HTML output is still
produced.

We therefore:

1. Wrap ``publish_string`` on both ``docutils.core`` and ``ir.module`` (Odoo
   imports the function locally).
2. Patch ``docutils.utils.Reporter.__init__`` so the default ``stream=None``
   becomes ``stream=False``, which discards report lines docutils would print —
   this covers all Reporter-based output regardless of call path or stderr
   swapping quirks on Odoo.sh workers.
"""

import functools
import inspect

_APPLIED = False


def apply_patch():
    global _APPLIED
    if _APPLIED:
        return

    try:
        import docutils.core as _dc
        import docutils.utils as _du
    except ImportError:
        return

    try:
        from odoo.addons.base.models import ir_module as _ir_module_mod
    except Exception:
        _ir_module_mod = None

    # --- Reporter: drop default stderr diagnostics (still returns HTML output) ---
    _orig_reporter_init = _du.Reporter.__init__

    @functools.wraps(_orig_reporter_init)
    def _Reporter__init__(self, *args, **kwargs):
        _sig = inspect.signature(_orig_reporter_init)
        _ba = _sig.bind(self, *args, **kwargs)
        _ba.apply_defaults()
        if _ba.arguments.get("stream") is None:
            _ba.arguments["stream"] = False
        return _orig_reporter_init(**_ba.arguments)

    _du.Reporter.__init__ = _Reporter__init__

    # --- publish_string: keep ir_module + docutils.core bindings aligned ---
    _orig_publish_string = _dc.publish_string

    def publish_string(*args, **kwargs):
        import sys
        from io import StringIO

        buf = StringIO()
        old_stderr = sys.stderr
        sys.stderr = buf
        try:
            return _orig_publish_string(*args, **kwargs)
        finally:
            sys.stderr = old_stderr

    _dc.publish_string = publish_string
    if _ir_module_mod is not None:
        _ir_module_mod.publish_string = publish_string

    _APPLIED = True
