import React from "react";

export function StatusBadge({ status, label, variant, size = "md", children }) {
  const resolvedVariant = variant || (
    status === "verified" || status === "covered" || status === "final" || status === "Kesinleşmiş"
      ? "success"
      : status === "review" || status === "estimate" || status === "Tahmini" || status === "İnceleme"
      ? "warning"
      : status === "danger" || status === "error" || status === "blocked"
      ? "danger"
      : status === "info"
      ? "info"
      : "neutral"
  );

  const displayText = label || children || status || "";
  const marker = {
    success: "✓",
    warning: "!",
    danger: "×",
    info: "i",
    neutral: "•",
  }[resolvedVariant] || "•";

  return (
    <span
      className={`nexus-badge nexus-badge--${resolvedVariant} nexus-badge--${size}`}
      role="status"
      aria-label={String(displayText)}
      data-status={status || resolvedVariant}
    >
      <span className="nexus-badge__dot" aria-hidden="true">{marker}</span>
      <span className="nexus-badge__label">{displayText}</span>
    </span>
  );
}
