"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { SupabaseAuthPanel, type SupabaseAuthSnapshot } from "@/components/supabase-auth-panel";
import { OFFICIAL_SITE_URL } from "@/lib/site";
import type { WaitlistApplication, WaitlistApplicationStatus } from "@/lib/types";
import { createClient } from "@/utils/supabase/client";

import styles from "./admin-waitlist.module.css";

const statusLabels: Record<WaitlistApplicationStatus, string> = {
  submitted: "待审核",
  reviewing: "审核中",
  invited: "已邀请",
  declined: "暂不邀请",
};

const experienceLabels: Record<WaitlistApplication["investment_experience"], string> = {
  beginner: "刚开始投资",
  one_to_three_years: "1–3 年",
  three_to_five_years: "3–5 年",
  five_plus_years: "5 年以上",
};

function readableError(error: unknown) {
  const message = error instanceof Error ? error.message : "暂时无法读取申请记录。";
  if (message.includes("waitlist_applications") || message.includes("admin_users")) {
    return "等待名单后台尚未配置完成，请先执行 Supabase 的 0004 数据库迁移。";
  }
  return message;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function AdminWaitlistClient() {
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [applications, setApplications] = useState<WaitlistApplication[]>([]);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadAdminData = useCallback(async (nextUser: User) => {
    setIsChecking(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: adminRecord, error: roleError } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", nextUser.id)
        .maybeSingle();
      if (roleError) throw roleError;
      if (!adminRecord) {
        setIsAdmin(false);
        setApplications([]);
        return;
      }
      setIsAdmin(true);
      const { data, error: applicationsError } = await supabase
        .from("waitlist_applications")
        .select("*")
        .order("created_at", { ascending: false });
      if (applicationsError) throw applicationsError;
      setApplications((data ?? []) as WaitlistApplication[]);
    } catch (loadError) {
      setIsAdmin(false);
      setError(readableError(loadError));
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void loadAdminData(user);
    } else {
      setIsAdmin(null);
      setApplications([]);
    }
  }, [loadAdminData, user]);

  const handleAuthChange = useCallback((snapshot: SupabaseAuthSnapshot) => {
    setUser(snapshot.user);
    setAuthError(snapshot.error);
  }, []);

  const stats = useMemo(() => ({
    total: applications.length,
    submitted: applications.filter((item) => item.status === "submitted").length,
    invited: applications.filter((item) => item.status === "invited").length,
  }), [applications]);

  async function updateStatus(application: WaitlistApplication, status: WaitlistApplicationStatus) {
    setUpdatingId(application.id);
    setError("");
    try {
      const supabase = createClient();
      const { data, error: updateError } = await supabase
        .from("waitlist_applications")
        .update({ status })
        .eq("id", application.id)
        .select("*")
        .single();
      if (updateError) throw updateError;
      setApplications((items) => items.map((item) => item.id === application.id ? data as WaitlistApplication : item));
    } catch (updateError) {
      setError(readableError(updateError));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href={OFFICIAL_SITE_URL} aria-label="前往 OpenAshare 官网">
          <img src="/favicon.svg" alt="" width="32" height="32" />
          <span>OpenAshare <small>ADMIN</small></span>
        </a>
        <SupabaseAuthPanel placement="header" onAuthChange={handleAuthChange} />
      </header>

      <section className={styles.content} aria-labelledby="admin-title">
        <div className={styles.heading}>
          <p>PRIVATE OPERATIONS</p>
          <h1 id="admin-title">等待名单管理</h1>
          <span>此页面仅供已授权管理员查看与更新申请状态。</span>
        </div>

        {!user ? <div className={styles.notice}>请使用管理员账号登录。</div> : null}
        {authError ? <div className={styles.error}>{authError}</div> : null}
        {isChecking ? <div className={styles.notice}>正在验证管理员权限…</div> : null}
        {user && isAdmin === false && !isChecking ? <div className={styles.denied}>当前账号没有后台访问权限。申请数据未被加载。</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        {isAdmin ? (
          <>
            <div className={styles.stats}>
              <div><strong>{stats.total}</strong><span>全部申请</span></div>
              <div><strong>{stats.submitted}</strong><span>待审核</span></div>
              <div><strong>{stats.invited}</strong><span>已邀请</span></div>
            </div>
            <div className={styles.list}>
              {applications.length === 0 ? <div className={styles.notice}>还没有等待名单申请。</div> : applications.map((application) => (
                <article className={styles.application} key={application.id}>
                  <div className={styles.applicationTop}>
                    <div>
                      <strong>{application.email}</strong>
                      <span>{formatDate(application.created_at)}</span>
                    </div>
                    <select value={application.status} disabled={updatingId === application.id} onChange={(event) => void updateStatus(application, event.target.value as WaitlistApplicationStatus)} aria-label={`更新 ${application.email} 的申请状态`}>
                      {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <dl>
                    <div><dt>经历</dt><dd>{experienceLabels[application.investment_experience]}</dd></div>
                    <div><dt>市场</dt><dd>{application.focus_markets.join("、") || "未填写"}</dd></div>
                    <div><dt>目标</dt><dd>{application.research_goals.join("、") || "未填写"}</dd></div>
                  </dl>
                  {application.note ? <p className={styles.note}>{application.note}</p> : null}
                </article>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
