from __future__ import annotations

import os
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]


def config_value(*names: str, default: str = "") -> str:
    env_file = _read_env_file(ROOT_DIR / ".env")
    for name in names:
        value = os.environ.get(name) or env_file.get(name)
        if value:
            return value
    return default


def config_bool(*names: str) -> bool:
    value = config_value(*names).strip().lower()
    if value in {"", "0", "false", "no", "off", "none"}:
        return False
    return True


def _read_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}

    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values
