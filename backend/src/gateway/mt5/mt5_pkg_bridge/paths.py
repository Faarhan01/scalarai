"""
mt5_pkg_bridge — Package Discovery
==========================
Locates the MetaTrader5 Python package.

Search order:
  1. An explicit path passed in by the caller.
  2. Whatever is already importable on sys.path.

That is the whole list, deliberately.

This module used to have three more branches: the CONY_MT5_PACKAGE and
PERON_PACKAGE_PATH environment variables, and three `../metatrader5_package`
relative candidates left over from a project layout that scalarai does not use.
None of them ever matched here -- both env vars are unset at process, user and
machine level, and none of the relative paths exist -- so `find_mt5_package()`
returned None and the pip-installed copy in site-packages was always the one
that got imported.

Worse, they were not inert. `is_package_dir()` accepts any directory holding a
`MetaTrader5/` subfolder, and a second copy did exist at
Tools/peron/metatrader5_package. Setting PERON_PACKAGE_PATH, or dropping a copy
at backend/mt5/metatrader5_package, would have switched the bridge onto a
different binary with no warning and no log line. That copy has since been
deleted.

Keeping a discovery mechanism that cannot fire is worse than not having one:
it invites a configuration that changes behaviour invisibly. Only a caller who
explicitly asks for a path can now move the package.
"""

import os
import sys
from typing import Optional

# The canonical location for this interpreter, recorded for diagnostics only.
# Nothing reads it to decide behaviour -- see the module docstring.
DEFAULT_LOCATION = os.path.join(
    sys.prefix, "Lib", "site-packages"
)


def is_package_dir(path: str) -> bool:
    """True when `path` is a directory containing the MetaTrader5 package."""
    if not path:
        return False
    return os.path.isdir(os.path.join(path, "MetaTrader5"))


def find_mt5_package(explicit: Optional[str] = None) -> Optional[str]:
    """
    Best-effort resolution of the directory that should be on sys.path.

    Returns None when MetaTrader5 is already importable without help, which
    is the normal and expected case for a pip-installed copy.
    """
    if explicit and is_package_dir(explicit):
        return os.path.abspath(explicit)
    return None


def ensure_on_path(explicit: Optional[str] = None) -> Optional[str]:
    """Put the package on sys.path if we can find it. Returns the path used."""
    resolved = find_mt5_package(explicit)
    if resolved and resolved not in sys.path:
        sys.path.insert(0, resolved)
    return resolved
