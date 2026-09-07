import React from "react";

export function ChartCard({
  title,
  subtitle,
  badge,
  series = [],
  children,
  empty = false,
  emptyMessage = "Grafik için veri bulunamadı.",
  height = 300,
  actions,
  className = "",
}) {
  return (
    <div className={`nexus-chart-card ${className}`}>
      <div className="nexus-chart-card__header">
        <div>
          <h3 className="nexus-chart-card__title">{title}</h3>
          {subtitle && <p className="nexus-chart-card__subtitle">{subtitle}</p>}
        </div>
        <div className="nexus-chart-card__actions">
          {badge}
          {actions}
        </div>
      </div>

      {series.length > 0 && (
        <ul className="nexus-chart-card__legend" aria-label={`${title} serileri`}>
          {series.map((item) => (
            <li key={item.name} className="nexus-chart-card__legend-item">
              <span
                className="nexus-chart-card__legend-dot"
                style={{ backgroundColor: item.color }}
              />
              <span className="nexus-chart-card__legend-label">{item.name}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="nexus-chart-card__body" style={{ minHeight: height }}>
        {empty ? (
          <div className="nexus-chart-card__empty">{emptyMessage}</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
