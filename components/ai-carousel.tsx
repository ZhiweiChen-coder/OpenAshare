"use client";

import { useMemo, type ReactNode } from "react";

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
  /^(?:#+\s*)?(?:[\u{1F300}-\u{1FAFF}]\s*)?(?:\d+[.、]\s*)?(分析摘要|概述|股票概况|技术分析|成交量分析|风险评估|投资建议|风险提示与免责声明|重要提示|请确保|本分析报告)/u;

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
    if (!line || /^-{3,}$/.test(line)) continue;

    if (isReportTitle(line)) {
      report.title = line.replace(/^#+\s*/, "");
      continue;
    }

    if (isSectionHeading(line)) {
      currentSection = {
        title: line.replace(/^#+\s*/, ""),
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

export function AICarousel({ content }: { content: string }) {
  const report = useMemo(() => parseAnalysisReport(content), [content]);

  if (!content?.trim()) {
    return <p className="muted">AI 暂未返回内容。</p>;
  }

  return (
    <div className="ai-carousel">
      <div className="ai-carousel-hero">
        <div className="ai-carousel-hero-copy">
          <div className="ai-carousel-kicker">AI 分析</div>
          <h3 className="ai-carousel-title">分析阅读稿</h3>
          <p className="ai-carousel-subtitle">已按投研报告结构整理为摘要、章节和关键要点。</p>
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
