from pathlib import Path
import yaml


def _merge(base, overrides):
    for key, value in (overrides or {}).items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            _merge(base[key], value)
        else:
            base[key] = value
    return base


def load_config(path="config/profile.yaml"):
    config_path = Path(path)
    with config_path.open(encoding="utf-8") as f:
        config = yaml.safe_load(f) or {}
    override_path = config_path.with_name("user_overrides.yaml")
    if override_path.exists():
        with override_path.open(encoding="utf-8") as f:
            _merge(config, yaml.safe_load(f) or {})
    return config


def save_user_overrides(overrides, path="config/profile.yaml"):
    config_path = Path(path)
    override_path = config_path.with_name("user_overrides.yaml")
    override_path.parent.mkdir(parents=True, exist_ok=True)
    with override_path.open("w", encoding="utf-8") as f:
        yaml.safe_dump(overrides, f, allow_unicode=True, sort_keys=False)
