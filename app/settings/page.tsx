import { cookies } from "next/headers";

import { DemoAccessGate } from "@/components/demo-access-gate";
import { SettingsForm } from "@/components/settings-form";
import { DEMO_ACCESS_COOKIE_NAME } from "@/lib/demo-access";
import { getDemoAccessStatusFromToken } from "@/lib/demo-access-server";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const demoAccess = getDemoAccessStatusFromToken(cookieStore.get(DEMO_ACCESS_COOKIE_NAME)?.value);
  if (!demoAccess.unlocked) {
    return (
      <section className="panel section">
        <DemoAccessGate title="设置已锁定" description="解锁后可以修改模型、LLM Base URL 和 API Key。" />
      </section>
    );
  }
  return <SettingsForm />;
}
