"use client";

import { useMemo, useState } from "react";

import { MarkdownText } from "@/components/markdown-text";

type TopicCard = {
  title: string;
  body: string;
};

function splitToTopicCards(markdown: string): TopicCard[] {
  const text = (markdown || "").trim();
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
  const canPrev = index > 0;
  const canNext = index < cards.length - 1;

  return (
    <div className="ai-carousel">
      <div className="ai-carousel-top">
        <div>
          <div className="muted ai-carousel-kicker">Topic {index + 1} / {cards.length}</div>
          <h3 className="ai-carousel-title">{active.title}</h3>
        </div>
        <div className="ai-carousel-actions">
          <button className="button ghost" type="button" disabled={!canPrev} onClick={() => setIndex((v) => Math.max(0, v - 1))}>
            上一条
          </button>
          <button className="button" type="button" disabled={!canNext} onClick={() => setIndex((v) => Math.min(cards.length - 1, v + 1))}>
            下一条
          </button>
        </div>
      </div>

      <div className="ai-card">
        <div className="ai-scroll">
          <MarkdownText content={active.body} />
        </div>
      </div>

      <div className="ai-carousel-dots" role="tablist" aria-label="AI topics">
        {cards.map((card, i) => (
          <button
            key={`${card.title}-${i}`}
            type="button"
            className={`ai-dot ${i === index ? "active" : ""}`}
            onClick={() => setIndex(i)}
            aria-label={`Topic ${i + 1}`}
            aria-current={i === index}
          />
        ))}
      </div>
    </div>
  );
}

