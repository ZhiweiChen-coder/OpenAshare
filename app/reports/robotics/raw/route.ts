import { readFile } from "node:fs/promises";
import path from "node:path";

const reportPath = path.join(process.cwd(), "reports", "robotics_industry_h2_2026_analysis.html");

export async function GET() {
  try {
    const html = await readFile(reportPath, "utf8");

    return new Response(html, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";

    return new Response(`机器人产业报告暂时不可用：${message}`, {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  }
}
