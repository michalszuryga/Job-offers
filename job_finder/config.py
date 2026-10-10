import json
from pathlib import Path

import yaml

# Scoring tweaks made in the dashboard live in the DB (not a file on disk) so
# they survive Streamlit Cloud restarts, are shared across devices, and are
# seen by the scheduled fetch running in GitHub Actions.
OVERRIDES_META_KEY = "config_overrides"


def _merge(base, overrides):
    for key, value in (overrides or {}).items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            _merge(base[key], value)
        else:
            base[key] = value
    return base


def overrides_from_meta(meta):
    try:
        return json.loads(meta.get(OVERRIDES_META_KEY) or "{}")
    except json.JSONDecodeError:
        return {}


def load_config(path="config/profile.yaml", overrides=None):
    with Path(path).open(encoding="utf-8") as f:
        config = yaml.safe_load(f) or {}
    return _merge(config, overrides)
