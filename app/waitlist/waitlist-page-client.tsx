"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { SupabaseAuthPanel, type SupabaseAuthSnapshot } from "@/components/supabase-auth-panel";
import { OFFICIAL_SITE_URL } from "@/lib/site";
import type { InvestmentExperience, WaitlistApplication } from "@/lib/types";
import { createClient } from "@/utils/supabase/client";

import styles from "./waitlist.module.css";

const experienceOptions: Array<{ value: InvestmentExperience; label: string }> = [
  { value: "beginner", label: "刚开始投资" },
  { value: "one_to_three_years", label: "1–3 年" },
  { value: "three_to_five_years", label: "3–5 年" },
  { value: "five_plus_years", label: "5 年以上" },
];

const marketOptions = ["内地股票", "香港股票"];
const goalOptions = ["个股研究", "市场与热点跟踪", "持仓复盘", "建立研究工作流"];

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function readableError(error: unknown) {
  const message = error instanceof Error ? error.message : "暂时无法提交申请，请稍后重试。";
  if (message.includes("waitlist_applications")) {
    return "等待名单尚未配置完成，请管理员先执行最新的 Supabase 数据库迁移。";
  }
  return message;
}

export function WaitlistPageClient() {
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [application, setApplication] = useState<WaitlistApplication | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [experience, setExperience] = useState<InvestmentExperience>("beginner");
  const [markets, setMarkets] = useState<string[]>([]);
  const [goals, setGoals] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const loadApplication = useCallback(async (nextUser: User) => {
    setIsLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { data, error: queryError } = await supabase
        .from("waitlist_applications")
        .select("*")
        .eq("user_id", nextUser.id)
        .maybeSingle();
      if (queryError) throw queryError;
      const nextApplication = (data ?? null) as WaitlistApplication | null;
      setApplication(nextApplication);
      if (nextApplication) {
        setExperience(nextApplication.investment_experience);
        setMarkets(nextApplication.focus_markets);
        setGoals(nextApplication.research_goals);
        setNote(nextApplication.note);
      }
    } catch (loadError) {
      setError(readableError(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void loadApplication(user);
    } else {
      setApplication(null);
      setMessage("");
    }
  }, [loadApplication, user]);

  const handleAuthChange = useCallback((snapshot: SupabaseAuthSnapshot) => {
    setUser(snapshot.user);
    setAuthError(snapshot.error);
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    if (markets.length === 0) {
      setError("请至少选择一个关注市场。");
      return;
    }
    if (goals.length === 0) {
      setError("请至少选择一个研究目标。");
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    setError("");
    try {
      const supabase = createClient();
      const { data, error: upsertError } = await supabase
        .from("waitlist_applications")
        .upsert(
          {
            user_id: user.id,
            email: user.email ?? "",
            investment_experience: experience,
            focus_markets: markets,
            research_goals: goals,
            note: note.trim(),
          },
          { onConflict: "user_id" },
        )
        .select("*")
        .single();
      if (upsertError) throw upsertError;
      setApplication(data as WaitlistApplication);
      setMessage("已加入等待名单。开放邀请时，我们会通过登录邮箱联系你。");
    } catch (submitError) {
      setError(readableError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  const isLocked = application !== null && application.status !== "submitted";

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href={OFFICIAL_SITE_URL} aria-label="前往 OpenAshare 官网">
          <img src="/favicon.svg" alt="" width="36" height="36" />
          <span>OpenAshare<small>AI RESEARCH DESK</small></span>
        </a>
        <SupabaseAuthPanel placement="header" onAuthChange={handleAuthChange} />
      </header>

      <section className={styles.content} aria-labelledby="waitlist-title">
        <div className={styles.intro}>
          <p>OPENAShare CLOUD BETA</p>
          <h1 id="waitlist-title">申请加入等待名单</h1>
          <p>用一分钟告诉我们你的研究习惯，帮助我们按合适的节奏邀请测试用户。</p>
          <ul>
            <li>只收集用于产品邀请与研究的必要信息</li>
            <li>不会据此提供个股买卖建议</li>
            <li>提交后可在审核前更新资料</li>
          </ul>
        </div>

        <div className={styles.panel}>
          {!user ? (
            <div className={styles.signInState}>
              <strong>请先登录，再填写申请。</strong>
              <p>登录邮箱会作为申请的联系邮箱，不需要重复填写。</p>
              {authError ? <p className={styles.error}>{authError}</p> : null}
            </div>
          ) : isLoading ? (
            <p className={styles.loading}>正在读取你的申请…</p>
          ) : (
            <form onSubmit={submit}>
              <div className={styles.emailRow}>
                <span>联系邮箱</span>
                <strong>{user.email ?? "当前登录账户"}</strong>
              </div>

              <fieldset disabled={isLocked || isSubmitting}>
                <legend>你的投资经历</legend>
                <div className={styles.optionGrid}>
                  {experienceOptions.map((option) => (
                    <label className={styles.option} key={option.value}>
                      <input type="radio" name="experience" value={option.value} checked={experience === option.value} onChange={() => setExperience(option.value)} />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset disabled={isLocked || isSubmitting}>
                <legend>你主要关注哪些市场？<small>可多选</small></legend>
                <div className={styles.optionGrid}>
                  {marketOptions.map((option) => (
                    <label className={styles.option} key={option}>
                      <input type="checkbox" checked={markets.includes(option)} onChange={() => setMarkets((items) => toggleValue(items, option))} />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset disabled={isLocked || isSubmitting}>
                <legend>你最希望先解决什么？<small>可多选</small></legend>
                <div className={styles.optionGrid}>
                  {goalOptions.map((option) => (
                    <label className={styles.option} key={option}>
                      <input type="checkbox" checked={goals.includes(option)} onChange={() => setGoals((items) => toggleValue(items, option))} />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className={styles.noteLabel}>
                <span>还有什么希望我们了解？<small>选填，最多 600 字</small></span>
                <textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, 600))} rows={4} disabled={isLocked || isSubmitting} placeholder="例如：你现在如何整理研究资料，或期待 Agent 帮上什么忙。" />
              </label>

              {isLocked ? <p className={styles.status}>你的申请正在{application.status === "reviewing" ? "审核" : application.status === "invited" ? "等待邀请" : "处理"}，暂时不能修改。</p> : null}
              {error ? <p className={styles.error}>{error}</p> : null}
              {message ? <p className={styles.success}>{message}</p> : null}
              <button className={styles.submit} type="submit" disabled={isLocked || isSubmitting}>{isSubmitting ? "提交中…" : application ? "更新申请" : "提交申请"}</button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
