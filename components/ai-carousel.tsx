"use client";

import { useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type AICarouselProps = {
  content: string;
  stockName?: string;
  stockCode?: string;
  provider?: string | null;
  model?: string | null;
};

export function AICarousel({ content, stockName, stockCode, provider, model }: AICarouselProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  if (!content?.trim()) {
    return <p className="muted">AI 暂未返回内容。</p>;
  }

  const handleDownloadPdf = () => {
    const html = bodyRef.current?.innerHTML ?? "";
    printReportAsPdf(html, { stockName, stockCode, provider, model });
  };

  return (
    <div className="ai-carousel">
      <div className="ai-carousel-hero">
        <div className="ai-carousel-hero-copy">
          <div className="ai-carousel-kicker">AI 分析</div>
          <h3 className="ai-carousel-title">分析阅读稿</h3>
          <p className="ai-carousel-subtitle">完整 AI 投研观点，按报告结构清晰排版。</p>
        </div>
        <div className="ai-carousel-actions">
          <button className="button ghost ai-download-button" type="button" onClick={handleDownloadPdf}>
            下载 PDF
          </button>
        </div>
      </div>

      <div className="ai-card ai-report-card">
        <div className="ai-scroll ai-scroll-rich ai-report-body">
          <div className="ai-report-md" ref={bodyRef}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}

function printReportAsPdf(
  bodyHtml: string,
  metadata: Pick<AICarouselProps, "stockName" | "stockCode" | "provider" | "model">,
) {
  if (typeof window === "undefined") return;

  const printWindow = window.open("", "_blank", "width=980,height=1200");
  if (!printWindow) {
    window.alert("浏览器阻止了下载窗口，请允许弹窗后重试。");
    return;
  }
  printWindow.opener = null;

  const stockLabel = [metadata.stockName, metadata.stockCode].filter(Boolean).join(" ");
  const generatedAt = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  const title = stockLabel ? `${stockLabel} · AI 分析报告` : "AI 分析报告";
  const subtitle = [
    stockLabel || "当前股票",
    `生成时间 ${generatedAt}`,
    metadata.model ? `模型 ${metadata.model}` : metadata.provider ? `服务 ${metadata.provider}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  printWindow.document.open();
  printWindow.document.write(buildPrintableReportHtml(title, subtitle, bodyHtml));
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 250);
}

function buildPrintableReportHtml(title: string, subtitle: string, bodyHtml: string) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #1c1a17;
      background: #fff;
      font-family: "Avenir Next", "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif;
      line-height: 1.78;
      font-size: 14px;
    }
    .cover {
      padding: 22px 24px;
      margin-bottom: 20px;
      border: 1px solid #ded8cf;
      border-radius: 12px;
      background: linear-gradient(135deg, #f8f5ef, #ffffff);
    }
    .eyebrow { color: #0f8a7b; font-size: 11px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
    .cover h1 { margin: 8px 0 6px; font-size: 24px; line-height: 1.35; }
    .subtitle { margin: 0; color: #6b655f; font-size: 12px; }
    h1, h2, h3, h4 { line-height: 1.4; margin: 22px 0 10px; }
    h2 { font-size: 18px; border-bottom: 1px solid #ece7df; padding-bottom: 6px; }
    h3 { font-size: 15px; }
    p { margin: 0 0 10px; }
    ul, ol { margin: 0 0 12px; padding-left: 22px; }
    li { margin: 4px 0; }
    strong { font-weight: 800; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
    th, td { border: 1px solid #e4dfd7; padding: 7px 10px; text-align: left; }
    th { background: #f4f1eb; }
    code { padding: 2px 5px; border-radius: 5px; background: #f0ece5; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; }
    blockquote { margin: 12px 0; padding: 8px 14px; border-left: 4px solid #0f8a7b; background: #fbfaf7; color: #4a4540; }
    section, h2, h3 { break-inside: avoid; page-break-inside: avoid; }
  </style>
</head>
<body>
  <header class="cover">
    <div class="eyebrow">AI Analysis Report</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="subtitle">${escapeHtml(subtitle)}</p>
  </header>
  <main>${bodyHtml}</main>
</body>
</html>`;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
