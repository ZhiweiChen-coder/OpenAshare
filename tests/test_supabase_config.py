from api.supabase_config import SupabaseConfig


def test_supabase_config_accepts_frontend_publishable_names(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_ANON_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_PUBLISHABLE_KEY", raising=False)
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co/")
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")

    config = SupabaseConfig.from_env()

    assert config.enabled is True
    assert config.url == "https://example.supabase.co"
    assert config.anon_key == "sb_publishable_test"


def test_server_names_take_precedence_over_frontend_fallback(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://server.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "server-key")
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_URL", "https://frontend.supabase.co")
    monkeypatch.setenv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "frontend-key")

    config = SupabaseConfig.from_env()

    assert config.url == "https://server.supabase.co"
    assert config.anon_key == "server-key"
