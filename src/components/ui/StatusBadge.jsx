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

  return (
    <span className={`nexus-badge nexus-badge--${resolvedVariant} nexus-badge--${size}`}>
      <span className="nexus-badge__dot" />
      <span className="nexus-badge__label">{displayText}</span>
    </span>
  );
}
