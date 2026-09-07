import React from "react";
import { StatusBadge } from "./StatusBadge.jsx";

export function MetricCard({
  title,
  value,
  secondaryValue,
  badge,
  badgeVariant,
  icon: Icon,
  subtitle,
  variant = "default",
  className = "",
  onClick,
}) {
  const isClickable = typeof onClick === "function";

  return (
    <div
      className={`nexus-metric-card nexus-metric-card--${variant} ${isClickable ? "nexus-metric-card--clickable" : ""} ${className}`}
      onClick={onClick}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => e.key === "Enter" && onClick() : undefined}
    >
      <div className="nexus-metric-card__header">
        <span className="nexus-metric-card__title">{title}</span>
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

      {(subtitle || badge) && (
        <div className="nexus-metric-card__footer">
          {badge && (
            <StatusBadge variant={badgeVariant || "info"}>{badge}</StatusBadge>
          )}
          {subtitle && (
            <span className="nexus-metric-card__subtitle">{subtitle}</span>
          )}
        </div>
      )}
    </div>
  );
}
