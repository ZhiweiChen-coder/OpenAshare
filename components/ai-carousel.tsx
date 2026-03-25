"use client";

import { useMemo, useState } from "react";

import { MarkdownText } from "@/components/markdown-text";

type TopicCard = {
  title: string;
  body: string;
};

type AnalysisBlock = {
  title: string;
  body: string;
};

function splitToTopicCards(markdown: string): TopicCard[] {
  const text = normalizeAnalysisMarkdown(markdown);
  if (!text) return [];

  const lines = text.split("\n");
  const cards: TopicCard[] = [];
  let current: TopicCard | null = null;

  const pushCurrent = () => {
    if (!current) return;
    const body = current.body.trim();
    const title = current.title.trim() || "AI 分析";
    if (body) cards.push({ title, body });
    current = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    const heading = line.match(/^(#{2,3})\s+(.*)$/);
    if (heading) {
      pushCurrent();
      current = { title: heading[2] || "分析", body: "" };
      continue;
    }
    if (!current) {
      // If there's content before any heading, treat it as the first card body.
      current = { title: "分析摘要", body: "" };
    }
    current.body += `${line}\n`;
  }
  pushCurrent();

  // If we only got a tiny number of cards, avoid over-fragmentation.
  if (cards.length === 1) return cards;
  return cards.slice(0, 10);
}

function normalizeAnalysisMarkdown(markdown: string): string {
  const text = (markdown || "").trim();
  if (!text) return "";

  return text
    .replace(/\s+-\s(?=[^\s])/g, "\n- ")
    .replace(/([：:])\s+\*\s(?=[^\s])/g, "$1\n* ")
    .replace(/\s+\*\s(?=[A-Za-z0-9\u4e00-\u9fa5])/g, "\n* ")
    .replace(/\n{3,}/g, "\n\n");
}

function splitToAnalysisBlocks(markdown: string): AnalysisBlock[] {
  const normalized = normalizeAnalysisMarkdown(markdown);
  if (!normalized) {
    return [];
  }

  const lines = normalized.split("\n");
  const blocks: AnalysisBlock[] = [];
  let currentTitle = "";
  let currentBody: string[] = [];

  const pushCurrent = () => {
    const body = currentBody.join("\n").trim();
    const title = currentTitle.trim();
    if (body) {
      blocks.push({
        title: title || "分析要点",
        body,
      });
    }
    currentTitle = "";
    currentBody = [];
  };

  const isTopLevelBullet = (line: string) => /^-\s+/.test(line);
  const isNestedBullet = (line: string) => /^\s{2,}[-*]\s+/.test(line);
  const isOrderedItem = (line: string) => /^\s*\d+\.\s+/.test(line);

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line) {
      if (currentBody.length) {
        currentBody.push("");
      }
      continue;
    }

    if (isTopLevelBullet(line)) {
      pushCurrent();
      const content = line.replace(/^-\s+/, "").trim();
      const [maybeTitle, ...rest] = content.split(/[:：]/);
      const title = rest.length ? maybeTitle.trim() : content;
      const inlineBody = rest.length ? rest.join("：").trim() : "";
      currentTitle = cleanupBlockTitle(title) || "分析要点";
      currentBody = inlineBody ? [inlineBody] : [];
      continue;
    }

    if (isNestedBullet(line) || isOrderedItem(line) || currentBody.length || currentTitle) {
      currentBody.push(line.trim());
      continue;
    }

    currentBody.push(line.trim());
  }

  pushCurrent();

  return blocks.filter((block) => block.body.trim());
}

function cleanupBlockTitle(title: string) {
  return title
    .replace(/^[-*]\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/[：:]$/, "")
    .replace(/^[📋🧭📌]+/, "")
    .trim();
}

export function AICarousel({ content }: { content: string }) {
  const cards = useMemo(() => splitToTopicCards(content), [content]);
  const [index, setIndex] = useState(0);

  if (!content?.trim()) {
    return <p className="muted">AI 暂未返回内容。</p>;
  }

  // Fallback: if we can't find sections, show as scrollable markdown.
  if (!cards.length) {
    return (
      <div className="ai-scroll">
        <MarkdownText content={content} />
      </div>
    );
  }

  const active = cards[Math.min(index, cards.length - 1)]!;
  const analysisBlocks = useMemo(() => splitToAnalysisBlocks(active.body), [active.body]);
  const canPrev = index > 0;
  const canNext = index < cards.length - 1;

  return (
    <div className="ai-carousel">
      <div className="ai-carousel-hero">
        <div className="ai-carousel-hero-copy">
          <div className="ai-carousel-kicker">AI 分析</div>
          <h3 className="ai-carousel-title">{active.title}</h3>
          <p className="ai-carousel-subtitle">分析段落 {index + 1} / {cards.length}</p>
        </div>
        <div className="ai-carousel-hero-meta">
          <span className="ai-carousel-chip">阅读模式</span>
          <span className="ai-carousel-chip">分段摘要</span>
        </div>
      </div>

      <div className="ai-carousel-progress" aria-hidden="true">
        {cards.map((card, i) => (
          <button
            key={`${card.title}-${i}`}
            type="button"
            className={`ai-carousel-progress-step ${i === index ? "active" : ""} ${i < index ? "done" : ""}`}
            onClick={() => setIndex(i)}
            aria-label={`跳转到第 ${i + 1} 段：${card.title}`}
            aria-current={i === index}
          >
            <span />
          </button>
        ))}
      </div>

      <div className="ai-card">
        <div className="ai-card-headline">
          <div>
            <div className="ai-card-headline-kicker">📋 概述</div>
            <p className="ai-card-headline-copy">
              这里把模型输出拆成可阅读的段落，便于快速扫读结论、风险和行动建议。
            </p>
          </div>
          <div className="ai-card-headline-nav">
            <button className="button ghost ai-carousel-nav-button" type="button" disabled={!canPrev} onClick={() => setIndex((v) => Math.max(0, v - 1))}>
              上一段
            </button>
            <button className="button ai-carousel-nav-button" type="button" disabled={!canNext} onClick={() => setIndex((v) => Math.min(cards.length - 1, v + 1))}>
              下一段
            </button>
          </div>
        </div>

        <div className="ai-scroll ai-scroll-rich">
          {analysisBlocks.length > 1 ? (
            <div className="ai-analysis-grid">
              {analysisBlocks.map((block, blockIndex) => (
                <article className="ai-analysis-card" key={`${block.title}-${blockIndex}`}>
                  <div className="ai-analysis-card-head">
                    <span className="ai-analysis-card-index">{String(blockIndex + 1).padStart(2, "0")}</span>
                    <div>
                      <h4>{block.title}</h4>
                    </div>
                  </div>
                  <div className="ai-analysis-card-body">
                    <MarkdownText content={block.body} />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <MarkdownText content={active.body} />
          )}
        </div>
      </div>

    </div>
  );
}
