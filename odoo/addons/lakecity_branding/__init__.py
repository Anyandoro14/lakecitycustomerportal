# -*- coding: utf-8 -*-
"""LakeCity branding.

Also applies a docutils stderr shim during Apps module description rendering; see
``lakecity_docutils_quiet``.
"""

from . import lakecity_docutils_quiet

lakecity_docutils_quiet.apply_patch()
