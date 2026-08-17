"use client";

import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

import { createClient } from "@/utils/supabase/client";

export type SupabaseAuthSnapshot = {
  user: User | null;
  session: Session | null;
  error: string | null;
};

type SupabaseAuthPanelProps = {
  placement?: "header" | "profile";
  onAuthChange?: (snapshot: SupabaseAuthSnapshot) => void;
};

export function SupabaseAuthPanel({ placement = "header", onAuthChange }: SupabaseAuthPanelProps) {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    let mounted = true;
    let unsubscribe = () => undefined;

    try {
      const supabase = createClient();
      void supabase.auth.getSession().then((result: { data: { session: Session | null }; error: { message: string } | null }) => {
        const { data, error: sessionError } = result;
        if (!mounted) return;
        if (sessionError) {
          setError(sessionError.message);
          onAuthChange?.({ user: null, session: null, error: sessionError.message });
          return;
        }
        setUser(data.session?.user ?? null);
        onAuthChange?.({ user: data.session?.user ?? null, session: data.session, error: null });
      });
      const { data } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, nextSession: Session | null) => {
        if (!mounted) return;
        setUser(nextSession?.user ?? null);
        setMessage(event === "SIGNED_IN" ? "已登录，正在同步工作台" : "");
        onAuthChange?.({ user: nextSession?.user ?? null, session: nextSession, error: null });
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch (configError) {
      const text = configError instanceof Error ? configError.message : "Supabase 环境变量未配置";
      setConfigured(false);
      setError(text);
      onAuthChange?.({ user: null, session: null, error: text });
    }

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [onAuthChange]);

  async function submit(mode: "signIn" | "signUp") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const supabase = createClient();
      const result = mode === "signIn"
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (mode === "signUp" && !result.data.session) {
        setMessage("注册成功，请先查收确认邮件，再回来登录。");
      } else {
        setOpen(false);
        setMessage("已登录，正在同步工作台");
      }
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Supabase 登录失败");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      setMessage("已退出登录");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "退出登录失败");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const supabase = createClient();
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (oauthError) throw oauthError;
      if (data.url) window.location.assign(data.url);
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Google 登录失败");
      setBusy(false);
    }
  }

  if (!configured) {
    return <span className="workspace-auth-status muted">Supabase 未配置</span>;
  }

  if (user) {
    if (placement === "profile") {
      return (
        <div className="workspace-auth-wrap workspace-auth-wrap--profile">
          <div className="workspace-auth-profile-status">
            <span className="workspace-auth-state-dot" aria-hidden="true" />
            <span>
              <strong>已登录</strong>
              <small title={user.email ?? undefined}>{user.email ?? "已登录"}</small>
            </span>
          </div>
          <button type="button" className="workspace-auth-button workspace-auth-button--danger" onClick={signOut} disabled={busy}>
            {busy ? "退出中…" : "退出登录"}
          </button>
          {message ? <span className="workspace-auth-message">{message}</span> : null}
          {error ? <span className="workspace-auth-error">{error}</span> : null}
        </div>
      );
    }
    return (
      <div className={`workspace-auth-wrap workspace-auth-wrap--${placement}`}>
        <span className="workspace-auth-status" title={user.email ?? undefined}>
          云端 · {user.email ?? "已登录"}
        </span>
        <button type="button" className="workspace-auth-button" onClick={signOut} disabled={busy}>
          退出
        </button>
        {message ? <span className="workspace-auth-message">{message}</span> : null}
      </div>
    );
  }

  return (
    <div className={`workspace-auth-wrap workspace-auth-wrap--${placement}`}>
      <button type="button" className="workspace-auth-button" onClick={() => setOpen((value) => !value)}>
        登录 / 注册
      </button>
      {open ? (
        <form className={`workspace-auth-popover workspace-auth-popover--${placement}`} onSubmit={(event) => { event.preventDefault(); void submit("signIn"); }}>
          <strong>登录研究空间</strong>
          <button type="button" className="workspace-google-button" onClick={() => void signInWithGoogle()} disabled={busy}>
            <span className="workspace-google-mark" aria-hidden="true">G</span>
            <span>{busy ? "正在跳转…" : "使用 Google 登录"}</span>
          </button>
          <div className="workspace-auth-divider"><span>或使用邮箱</span></div>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="邮箱"
            autoComplete="email"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="密码（至少 6 位）"
            autoComplete="current-password"
            minLength={6}
            required
          />
          <div className="workspace-auth-actions">
            <button type="submit" disabled={busy}>{busy ? "处理中…" : "登录"}</button>
            <button type="button" onClick={() => void submit("signUp")} disabled={busy}>注册</button>
          </div>
          {error ? <small className="workspace-auth-error">{error}</small> : null}
          {message ? <small className="workspace-auth-message">{message}</small> : null}
        </form>
      ) : null}
    </div>
  );
}
