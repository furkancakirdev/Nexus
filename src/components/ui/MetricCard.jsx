import React from "react";
import { StatusBadge } from "./StatusBadge.jsx";

export function MetricCard({
  title,
  label,
  value,
  secondaryValue,
  detail,
  badge,
  badgeVariant,
  icon: Icon,
  subtitle,
  variant = "default",
  tone,
  className = "",
  onClick,
}) {
  const isClickable = typeof onClick === "function";
  const resolvedTitle = title ?? label;
  const resolvedSubtitle = subtitle ?? detail;
  const resolvedVariant = variant !== "default" ? variant : tone || variant;

  return (
    <div
      className={`nexus-metric-card nexus-metric-card--${resolvedVariant} ${isClickable ? "nexus-metric-card--clickable" : ""} ${className}`}
      onClick={onClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      data-tone={resolvedVariant}
    >
      <div className="nexus-metric-card__header">
        <span className="nexus-metric-card__title">{resolvedTitle}</span>
        {Icon && (
          <span className="nexus-metric-card__icon" aria-hidden="true">
            <Icon size={20} stroke={1.8} />
          </span>
        )}
      </div>

      <div className="nexus-metric-card__body label-value">
        <div className="nexus-metric-card__value">{value}</div>
        {secondaryValue && (
          <div className="nexus-metric-card__secondary">{secondaryValue}</div>
        )}
      </div>

      {(resolvedSubtitle || badge) && (
        <div className="nexus-metric-card__footer">
          {badge && (
            <StatusBadge variant={badgeVariant || "info"}>{badge}</StatusBadge>
          )}
          {resolvedSubtitle && (
            <span className="nexus-metric-card__subtitle">{resolvedSubtitle}</span>
          )}
        </div>
      )}
    </div>
  );
}
