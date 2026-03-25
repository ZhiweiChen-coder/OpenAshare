import { NextResponse } from "next/server";

import {
  buildDemoAccessCookieOptions,
  buildDemoAccessExpiry,
  clearDemoAccessCookieOptions,
  createDemoAccessToken,
  getDemoAccessStatusFromToken,
  isDemoAccessEnabled,
  DEMO_ACCESS_COOKIE_NAME,
} from "@/lib/demo-access-server";
import { DEMO_ACCESS_COOKIE_NAME as COOKIE_NAME } from "@/lib/demo-access";

type UnlockPayload = {
  code?: string;
};

export async function GET(request: Request) {
  const cookieValue = request.headers.get("cookie")?.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))?.[1];
  const status = getDemoAccessStatusFromToken(cookieValue ? decodeURIComponent(cookieValue) : undefined);
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isDemoAccessEnabled()) {
    return NextResponse.json(
      { enabled: false, unlocked: true, expires_at: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  let payload: UnlockPayload;
  try {
    payload = (await request.json()) as UnlockPayload;
  } catch {
    return NextResponse.json({ detail: "Invalid request body" }, { status: 400 });
  }

  const submittedCode = (payload.code ?? "").trim();
  const expectedCode = (process.env.DEMO_ACCESS_CODE ?? "").trim();
  if (!submittedCode || submittedCode !== expectedCode) {
    return NextResponse.json(
      { detail: "演示密钥不正确" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const token = createDemoAccessToken();
  const expiresAt = buildDemoAccessExpiry();
  const response = NextResponse.json(
    { enabled: true, unlocked: true, expires_at: expiresAt.toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(DEMO_ACCESS_COOKIE_NAME, token, buildDemoAccessCookieOptions(expiresAt));
  return response;
}

export async function DELETE() {
  const response = NextResponse.json(
    { enabled: true, unlocked: false, expires_at: null },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(DEMO_ACCESS_COOKIE_NAME, "", clearDemoAccessCookieOptions());
  return response;
}
