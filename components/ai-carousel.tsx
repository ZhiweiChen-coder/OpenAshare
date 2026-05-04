"use client";

import { useMemo, type ReactNode } from "react";

type AICarouselProps = {
  content: string;
  stockName?: string;
  stockCode?: string;
  provider?: string | null;
  model?: string | null;
};

function normalizeAnalysisMarkdown(markdown: string): string {
  const text = (markdown || "").trim();
  if (!text) return "";

  return text
    .replace(/([：:])\s+\*(?=\s*[A-Za-z0-9\u4e00-\u9fa5])/g, "$1\n* ")
    .replace(/([。；;])\s+\*(?=\s*[A-Za-z0-9\u4e00-\u9fa5])/g, "$1\n* ")
    .replace(/-\s+([^:\n]{2,28})[：:]\s+\*/g, "- $1：\n  * ")
    .replace(/\s+-\s(?=[^\s])/g, "\n- ")
    .replace(/([：:])\s+\*\s(?=[^\s])/g, "$1\n* ")
    .replace(/\s+\*\s(?=[A-Za-z0-9\u4e00-\u9fa5])/g, "\n* ")
    .replace(/\n{3,}/g, "\n\n");
}

type ReportItem = {
  label?: string;
  text: string;
};

type ReportSection = {
  title: string;
  items: ReportItem[];
  paragraphs: string[];
};

type ParsedReport = {
  title: string;
  lead: string[];
  sections: ReportSection[];
};

const HEADING_PATTERN =
  /^(?:#+\s*)?(?:\d+[.、]\s*)?(?:[\u{1F300}-\u{1FAFF}]\s*)?(分析摘要|概述|股票概况|技术分析|成交量分析|风险评估|投资建议|风险提示与免责声明|重要提示|请确保|本分析报告)/u;

function parseAnalysisReport(content: string): ParsedReport {
  const normalized = normalizeReportText(content);
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const report: ParsedReport = {
    title: "AI 深度分析报告",
    lead: [],
    sections: [],
  };
  let currentSection: ReportSection | null = null;

  for (const rawLine of lines) {
    const line = cleanMarkdownLine(rawLine);
    if (!line || /^-{3,}$/.test(line) || /^#{1,6}$/.test(line)) continue;

    if (isReportTitle(line)) {
      report.title = cleanHeadingText(line);
      continue;
    }

    if (isSectionHeading(line)) {
      currentSection = {
        title: cleanHeadingText(line),
        items: [],
        paragraphs: [],
      };
      report.sections.push(currentSection);
      continue;
    }

    const item = parseReportItem(line);
    if (!currentSection) {
      if (item) {
        report.lead.push(formatLabeledText(item));
      } else {
        report.lead.push(line);
      }
      continue;
    }

    if (item) {
      currentSection.items.push(item);
    } else {
      currentSection.paragraphs.push(line);
    }
  }

  if (!report.sections.length && report.lead.length) {
    report.sections.push({
      title: "模型原文",
      items: [],
      paragraphs: report.lead,
    });
    report.lead = [];
  }

  return report;
}

function normalizeReportText(content: string) {
  return normalizeAnalysisMarkdown(content)
    .replace(/\r\n/g, "\n")
    .replace(/```/g, "")
    .replace(/\s*---+\s*/g, "\n")
    .replace(/(^|\n)\s*#{1,6}\s*(?=\n|$)/g, "\n")
    .replace(/\s+(#{1,3}\s+)/g, "\n$1")
    .replace(/\s+(\d+[.、]\s*[\u{1F300}-\u{1FAFF}]?\s*[\u4e00-\u9fa5]{2,16})/gu, "\n$1")
    .replace(/\s+((?:#{1,3}\s*)?[\u{1F300}-\u{1FAFF}]?\s*(?:分析摘要|概述|重要提示|请确保))/gu, "\n$1")
    .replace(/\s+(-\s+\*\*[^*\n]{2,40}\*\*[：:])/g, "\n$1")
    .replace(/\s+(\*\s+[^*\n]{2,40}[：:])/g, "\n$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanMarkdownLine(line: string) {
  return line
    .replace(/^[-*]\s+/, "")
    .replace(/^#+\s*/, (match) => match)
    .replace(/\*\*\s+/g, "**")
    .replace(/\s+\*\*/g, " **")
    .trim();
}

function cleanHeadingText(line: string) {
  return line
    .replace(/^#+\s*/, "")
    .replace(/^\d+[.、]\s*/, "")
    .replace(/^[\u{1F300}-\u{1FAFF}]\s*/u, "")
    .replace(/\*\*/g, "")
    .trim();
}

function isReportTitle(line: string) {
  return /分析报告/.test(line) && !HEADING_PATTERN.test(line.replace(/分析报告.*/, ""));
}

function isSectionHeading(line: string) {
  return HEADING_PATTERN.test(line) && line.length <= 36;
}

function parseReportItem(line: string): ReportItem | null {
  const boldLabel = line.match(/^(?:[-*]\s*)?\*\*([^*：:]{2,40})\*\*[：:]\s*(.+)$/);
  if (boldLabel) {
    return { label: boldLabel[1], text: boldLabel[2].trim() };
  }

  const plainLabel = line.match(/^(?:[-*]\s*)?([^：:]{2,24})[：:]\s*(.+)$/);
  if (plainLabel && !/[。；;]$/.test(plainLabel[1])) {
    return { label: plainLabel[1].replace(/\*\*/g, "").trim(), text: plainLabel[2].trim() };
  }

  return null;
}

function formatLabeledText(item: ReportItem) {
  return item.label ? `${item.label}: ${item.text}` : item.text;
}

function renderInline(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return tokens.map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**")) {
      return <strong key={`${token}-${index}`}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith("`") && token.endsWith("`")) {
      return <code key={`${token}-${index}`}>{token.slice(1, -1)}</code>;
    }
    return <span key={`${token}-${index}`}>{token}</span>;
  });
}

function sectionTone(title: string) {
  if (/分析摘要/.test(title)) return "summary";
  if (/风险|免责声明|重要提示/.test(title)) return "risk";
  if (/投资建议|操作策略|目标|止损/.test(title)) return "action";
  if (/技术|成交量|股票概况/.test(title)) return "data";
  return "default";
}

export function AICarousel({ content, stockName, stockCode, provider, model }: AICarouselProps) {
  const report = useMemo(() => parseAnalysisReport(content), [content]);

  if (!content?.trim()) {
    return <p className="muted">AI 暂未返回内容。</p>;
  }

  const handleDownloadPdf = () => {
    printReportAsPdf(report, {
      stockName,
      stockCode,
      provider,
      model,
    });
  };

  return (
    <div className="ai-carousel">
      <div className="ai-carousel-hero">
        <div className="ai-carousel-hero-copy">
          <div className="ai-carousel-kicker">AI 分析</div>
          <h3 className="ai-carousel-title">分析阅读稿</h3>
          <p className="ai-carousel-subtitle">已按投研报告结构整理为摘要、章节和关键要点。</p>
        </div>
        <div className="ai-carousel-actions">
          <button className="button ghost ai-download-button" type="button" onClick={handleDownloadPdf}>
            下载 PDF
          </button>
        </div>
      </div>

      <div className="ai-card ai-report-card">
        <div className="ai-scroll ai-scroll-rich ai-report-body">
          <article className="ai-report">
            <header className="ai-report-header">
              <span className="ai-report-eyebrow">Deep Reading</span>
              <h4>{renderInline(report.title)}</h4>
              {report.lead.length ? (
                <div className="ai-report-lead">
                  {report.lead.slice(0, 3).map((paragraph, index) => (
                    <p key={`${index}-${paragraph.slice(0, 18)}`}>{renderInline(paragraph)}</p>
                  ))}
                </div>
              ) : null}
            </header>

            <div className="ai-report-sections">
              {report.sections.map((section, index) => (
                <section className={`ai-report-section ai-report-section-${sectionTone(section.title)}`} key={`${index}-${section.title}`}>
                  <div className="ai-report-section-head">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <h5>{renderInline(section.title)}</h5>
                  </div>

                  {section.paragraphs.map((paragraph, paragraphIndex) => (
                    <p className="ai-report-paragraph" key={`${paragraphIndex}-${paragraph.slice(0, 18)}`}>
                      {renderInline(paragraph)}
                    </p>
                  ))}

                  {section.items.length ? (
                    <div className="ai-report-item-list">
                      {section.items.map((item, itemIndex) => (
                        <div className="ai-report-item" key={`${itemIndex}-${item.label ?? item.text.slice(0, 16)}`}>
                          {item.label ? <strong>{renderInline(item.label)}</strong> : null}
                          <p>{renderInline(item.text)}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}

function printReportAsPdf(
  report: ParsedReport,
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
  const subtitle = [
    stockLabel || "当前股票",
    `生成时间 ${generatedAt}`,
    metadata.model ? `模型 ${metadata.model}` : metadata.provider ? `服务 ${metadata.provider}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  printWindow.document.open();
  printWindow.document.write(buildPrintableReportHtml(report, subtitle));
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 250);
}

function buildPrintableReportHtml(report: ParsedReport, subtitle: string) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.title)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #171717;
      background: #fff;
      font-family: "Avenir Next", "SF Pro Display", "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif;
      line-height: 1.75;
    }
    .report { display: grid; gap: 18px; }
    .cover {
      padding: 22px 24px;
      border: 1px solid #ded8cf;
      border-radius: 12px;
      background: linear-gradient(135deg, #f8f5ef, #ffffff);
    }
    .eyebrow {
      color: #0f8a7b;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    h1 {
      margin: 8px 0 6px;
      font-size: 25px;
      line-height: 1.35;
    }
    .subtitle {
      margin: 0;
      color: #6b655f;
      font-size: 12px;
    }
    .lead { display: grid; gap: 8px; margin-top: 14px; }
    .lead p, .section p, .item p { margin: 0; }
    .section {
      break-inside: avoid;
      page-break-inside: avoid;
      padding: 18px;
      border: 1px solid #e4dfd7;
      border-left: 4px solid #0f8a7b;
      border-radius: 12px;
    }
    .section + .section { margin-top: 12px; }
    .section-head {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
      padding: 7px 11px 7px 7px;
      border-radius: 999px;
      background: #f4f1eb;
      border: 1px solid #e4dfd7;
      white-space: nowrap;
    }
    .index {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 26px;
      border-radius: 999px;
      background: #fff;
      color: #6b655f;
      font-size: 12px;
      font-weight: 800;
    }
    h2 {
      margin: 0;
      font-size: 16px;
      line-height: 1.4;
    }
    .paragraphs { display: grid; gap: 10px; }
    .items {
      display: grid;
      gap: 10px;
      margin-top: 12px;
    }
    .item {
      padding: 12px 14px;
      border-radius: 10px;
      background: #fbfaf7;
      border: 1px solid #ebe6de;
    }
    .item strong {
      display: block;
      margin-bottom: 4px;
    }
    strong { font-weight: 800; }
    code {
      padding: 2px 5px;
      border-radius: 5px;
      background: #f0ece5;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.92em;
    }
  </style>
</head>
<body>
  <main class="report">
    <header class="cover">
      <div class="eyebrow">AI Analysis Report</div>
      <h1>${renderInlineHtml(report.title)}</h1>
      <p class="subtitle">${escapeHtml(subtitle)}</p>
      ${renderParagraphGroupHtml(report.lead, "lead")}
    </header>
    ${report.sections.map(renderSectionHtml).join("")}
  </main>
  <script>
    document.title = ${JSON.stringify(sanitizeFileName(report.title))};
  </script>
</body>
</html>`;
}

function renderSectionHtml(section: ReportSection, index: number) {
  return `<section class="section">
    <div class="section-head">
      <span class="index">${String(index + 1).padStart(2, "0")}</span>
      <h2>${renderInlineHtml(section.title)}</h2>
    </div>
    ${renderParagraphGroupHtml(section.paragraphs, "paragraphs")}
    ${
      section.items.length
        ? `<div class="items">${section.items
            .map(
              (item) => `<div class="item">${item.label ? `<strong>${renderInlineHtml(item.label)}</strong>` : ""}<p>${renderInlineHtml(item.text)}</p></div>`,
            )
            .join("")}</div>`
        : ""
    }
  </section>`;
}

function renderParagraphGroupHtml(paragraphs: string[], className: string) {
  if (!paragraphs.length) return "";
  return `<div class="${className}">${paragraphs.map((paragraph) => `<p>${renderInlineHtml(paragraph)}</p>`).join("")}</div>`;
}

function renderInlineHtml(text: string) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeFileName(text: string) {
  return `${text.replace(/[\\/:*?"<>|]/g, "_").slice(0, 48) || "AI分析报告"}.pdf`;
}
