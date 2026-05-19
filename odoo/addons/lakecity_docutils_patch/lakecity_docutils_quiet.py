# -*- coding: utf-8 -*-
"""Silence docutils stderr spam during Odoo Apps description RST rendering.

Odoo's ``ir.module.module._get_desc`` passes manifest text through docutils.
RST diagnostics are emitted via ``Reporter.system_message`` → ``stream.write``,
even when HTML output is still returned.

This module patches docutils once per process:

1. ``Reporter.__init__``: ``stream=None`` → ``False`` (discard diagnostics).
2. ``Reporter.system_message``: temporarily no-op ``stream.write`` (covers
   explicit stderr streams).
3. ``publish_string`` on ``docutils.core`` and ``ir.module`` (Odoo binds the
   latter at import time).

Loaded from a tiny addon that depends only on ``base`` so it runs before other
Lakecity modules even if imports between addons fail.
"""

from __future__ import annotations

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

    # --- Reporter: default stream discards output ---
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

    # --- Reporter.system_message: no-op stream writes (explicit stderr etc.) ---
    _orig_system_message = _du.Reporter.system_message

    @functools.wraps(_orig_system_message)
    def _Reporter_system_message(self, *args, **kwargs):
        stream = getattr(self, "stream", None)
        saved_write = None
        if stream is not None and hasattr(stream, "write"):
            saved_write = stream.write

            def _noop_write(_data):
                return None

            stream.write = _noop_write  # type: ignore[method-assign]

        try:
            return _orig_system_message(self, *args, **kwargs)
        finally:
            if saved_write is not None:
                stream.write = saved_write  # type: ignore[method-assign]

    _du.Reporter.system_message = _Reporter_system_message

    # --- publish_string: align docutils.core + ir_module bindings ---
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
