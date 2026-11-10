"""Strategy registry. Each strategy cites the archive source it was codified from."""
from __future__ import annotations

from .base import Strategy, REGISTRY, register, get, all_strategies  # noqa: F401
from . import core, structure_based, indicator_based, confluence, etf_system  # noqa: F401  (registers strategies)
