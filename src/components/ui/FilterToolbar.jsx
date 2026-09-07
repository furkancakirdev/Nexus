import React from "react";
import { IconSearch, IconX } from "@tabler/icons-react";

export function FilterToolbar({
  searchValue = "",
  onSearchChange,
  searchPlaceholder = "Arama yapın…",
  filters = [],
  actions,
  children,
  onReset,
  className = "",
}) {
  const hasActiveFilters = searchValue || filters.some((f) => f.value && f.value !== "all");

  return (
    <div className={`nexus-filter-toolbar ${className}`}>
      <div className="nexus-filter-toolbar__left">
        {onSearchChange && (
          <div className="nexus-filter-toolbar__search">
            <IconSearch size={16} className="nexus-filter-toolbar__search-icon" />
            <input
              type="text"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
            {searchValue && (
              <button
                type="button"
                className="nexus-filter-toolbar__search-clear"
                onClick={() => onSearchChange("")}
                aria-label="Aramayı temizle"
              >
                <IconX size={14} />
              </button>
            )}
          </div>
        )}

        {filters.map((filter) => (
          <label key={filter.key} className="nexus-filter-select-label">
            {filter.label && <span className="nexus-filter-select-title">{filter.label}</span>}
            <select
              value={filter.value}
              onChange={(e) => filter.onChange(e.target.value)}
              aria-label={filter.label || filter.key}
            >
              {filter.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        ))}

        {children}

        {hasActiveFilters && onReset && (
          <button
            type="button"
            className="nexus-filter-reset-btn"
            onClick={onReset}
          >
            Sıfırla
          </button>
        )}
      </div>

      {actions && (
        <div className="nexus-filter-toolbar__right">
          {actions}
        </div>
      )}
    </div>
  );
}
