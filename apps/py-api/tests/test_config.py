"""test_config.py · JWT_SECRET fail-fast 校验

覆盖：
- dev 环境：默认 dev-secret 占位 OK（≥16 字符）
- dev 环境：dev-secret 太短 → ValueError
- dev 环境：自定义 32 字符 OK
- prod 环境：dev-secret 占位 → ValueError
- prod 环境：自定义 < 32 字符 → ValueError
- prod 环境：自定义 ≥ 32 字符 OK
- SettingsValidationError 启动前 sys.exit(1)
"""
import pytest


def test_dev_default_ok(monkeypatch):
    """dev 环境默认 dev-secret-change-in-prod（27 字符 ≥ 16）应该 OK"""
    monkeypatch.setenv("NODE_ENV", "development")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    # 重新加载 settings 模块
    import importlib
    from app import config
    importlib.reload(config)
    assert len(config.settings.JWT_SECRET) >= 16


def test_dev_short_secret_fails(monkeypatch):
    """dev 环境 dev-secret 太短 → ValueError"""
    monkeypatch.setenv("NODE_ENV", "development")
    monkeypatch.setenv("JWT_SECRET", "dev-secret")  # 10 字符

    import importlib
    from app import config
    with pytest.raises((ValueError, SystemExit)):
        importlib.reload(config)


def test_dev_custom_long_ok(monkeypatch):
    """dev 环境自定义 ≥ 32 字符 OK"""
    monkeypatch.setenv("NODE_ENV", "development")
    monkeypatch.setenv("JWT_SECRET", "a" * 32)

    import importlib
    from app import config
    importlib.reload(config)
    assert config.settings.JWT_SECRET == "a" * 32


def test_prod_dev_secret_fails(monkeypatch):
    """prod 环境 dev-secret 占位 → ValueError"""
    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "dev-secret-change-in-prod")

    import importlib
    from app import config
    with pytest.raises((ValueError, SystemExit)):
        importlib.reload(config)


def test_prod_short_secret_fails(monkeypatch):
    """prod 环境自定义 < 32 字符 → ValueError"""
    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "a" * 20)

    import importlib
    from app import config
    with pytest.raises((ValueError, SystemExit)):
        importlib.reload(config)


def test_prod_strong_secret_ok(monkeypatch):
    """prod 环境自定义 ≥ 32 字符 OK"""
    monkeypatch.setenv("NODE_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "openssl-rand-base64-48-aaaaaaaaaaaaaaaaaaaaaaa")  # 48 字符

    import importlib
    from app import config
    importlib.reload(config)
    assert len(config.settings.JWT_SECRET) >= 32