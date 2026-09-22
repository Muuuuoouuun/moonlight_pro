"use client";

import React from "react";
import { Button, IconButton } from "./hub-primitives";
import { Iconed } from "./hub-icons";
import "./office-nudge.css";

const AGENT_ICONS = {
  eevee: "sparkle",
  vaporeon: "clock",
  jolteon: "bolt",
  flareon: "target",
  espeon: "eye",
  umbreon: "shield",
  leafeon: "coins",
  glaceon: "layers",
  sylveon: "message",
};

export function OfficeNudgeStrip({ nudge, onAction, onSnooze }) {
  if (!nudge) return null;

  const iconName = AGENT_ICONS[nudge.agentId] || "sparkle";

  return (
    <aside className="hub-office-nudge-strip fade-up" aria-label="오피스 비서 제안">
      <div className="hub-office-nudge-lead">
        <span className="hub-office-persona-pill">
          <Iconed name={iconName} size={13} />
          <span>{nudge.agentName}</span>
          <span style={{ color: "var(--fg-dim)", fontSize: 10 }}>· {nudge.agentTitle}</span>
        </span>
        <span className="hub-office-nudge-message" title={nudge.message}>
          {nudge.message}
        </span>
      </div>

      <div className="hub-office-nudge-actions">
        <Button
          variant="outline"
          className="hub-office-action-btn hub-office-glow"
          onClick={() => onAction?.(nudge)}
        >
          {nudge.ctaLabel || "조언 구하기"}
        </Button>
        {onSnooze && (
          <IconButton
            icon="x"
            size="sm"
            variant="ghost"
            title="오늘 하루 숨기기"
            aria-label="오늘 하루 숨기기"
            onClick={() => onSnooze(nudge.key)}
          />
        )}
      </div>
    </aside>
  );
}
