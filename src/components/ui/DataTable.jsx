import React, { useState, useMemo } from "react";
import { IconChevronDown, IconChevronUp, IconSearch, IconChevronRight } from "@tabler/icons-react";

export function DataTable({
  columns = [],
  data = [],
  keyField = "id",
  searchable = false,
  searchPlaceholder = "Tabloda ara…",
  searchKeys = [],
  pageSize = 15,
  paginated = true,
  expandable = false,
  renderExpandedRow,
  emptyMessage = "Kayıt bulunamadı.",
  className = "",
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedKeys, setExpandedKeys] = useState(new Set());

  const toggleExpand = (key) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filteredData = useMemo(() => {
    if (!query.trim()) return data;
    const lower = query.toLowerCase();
    return data.filter((row) => {
      if (searchKeys.length > 0) {
        return searchKeys.some((k) => String(row[k] || "").toLowerCase().includes(lower));
      }
      return Object.values(row).some((val) =>
        String(val || "").toLowerCase().includes(lower)
      );
    });
  }, [data, query, searchKeys]);

  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortDir === "asc"
        ? String(aVal).localeCompare(String(bVal), "tr")
        : String(bVal).localeCompare(String(aVal), "tr");
    });
  }, [filteredData, sortKey, sortDir]);

  const totalPages = paginated ? Math.ceil(sortedData.length / pageSize) || 1 : 1;
  const pagedData = useMemo(() => {
    if (!paginated) return sortedData;
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, paginated, currentPage, pageSize]);

  return (
    <div className={`nexus-data-table-wrap ${className}`}>
      {searchable && (
        <div className="nexus-data-table__toolbar" role="search">
          <div className="nexus-search-input">
            <IconSearch size={16} className="nexus-search-icon" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
          </div>
          <span className="nexus-data-table__count">
            {sortedData.length} kayıt
          </span>
        </div>
      )}

      <div className="nexus-data-table__scroller" tabIndex={0}>
        <table className="nexus-data-table" aria-label="Veri tablosu">
          <thead>
            <tr>
              {expandable && <th className="nexus-col-expand" scope="col" aria-label="Genişlet" />}
              {columns.map((col) => {
                const isSorted = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    style={{ textAlign: col.align || "left", width: col.width }}
                    className={col.sortable !== false ? "nexus-sortable-th" : ""}
                    scope="col"
                    aria-sort={col.sortable !== false ? (isSorted ? sortDir === "asc" ? "ascending" : "descending" : "none") : undefined}
                  >
                    <div className="nexus-th-content" style={{ justifyContent: col.align === "right" ? "flex-end" : col.align === "center" ? "center" : "flex-start" }}>
                      {col.sortable !== false ? (
                        <button
                          type="button"
                          className="nexus-sort-button"
                          onClick={() => handleSort(col.key)}
                          aria-label={`${col.label} sütununa göre sırala${isSorted ? `, şu an ${sortDir === "asc" ? "artan" : "azalan"}` : ""}`}
                        >
                          <span>{col.label}</span>
                        </button>
                      ) : <span>{col.label}</span>}
                      {col.sortable !== false && (
                        <span className="nexus-sort-icon" aria-hidden="true">
                          {isSorted && sortDir === "desc" ? (
                            <IconChevronDown size={14} />
                          ) : (
                            <IconChevronUp size={14} style={{ opacity: isSorted ? 1 : 0.25 }} />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pagedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (expandable ? 1 : 0)} className="nexus-empty-cell">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              pagedData.map((row, index) => {
                const rowKey = row[keyField] ?? index;
                const isExpanded = expandedKeys.has(rowKey);

                return (
                  <React.Fragment key={rowKey}>
                    <tr
                      className={`nexus-row ${isExpanded ? "nexus-row--expanded" : ""}`}
                      onClick={expandable ? () => toggleExpand(rowKey) : undefined}
                      style={{ cursor: expandable ? "pointer" : "default" }}
                    >
                      {expandable && (
                        <td className="nexus-col-expand">
                          <button
                            type="button"
                            className="nexus-expand-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(rowKey);
                            }}
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? "Satır detaylarını gizle" : "Satır detaylarını göster"}
                          >
                            <IconChevronRight
                              size={16}
                              style={{
                                transform: isExpanded ? "rotate(90deg)" : "none",
                                transition: "transform 0.15s ease",
                              }}
                            />
                          </button>
                        </td>
                      )}
                      {columns.map((col) => (
                        <td key={col.key} style={{ textAlign: col.align || "left" }}>
                          {col.render ? col.render(row[col.key], row) : (row[col.key] ?? "—")}
                        </td>
                      ))}
                    </tr>
                    {expandable && isExpanded && renderExpandedRow && (
                      <tr className="nexus-expanded-row">
                        <td colSpan={columns.length + 1}>
                          <div className="nexus-expanded-content">
                            {renderExpandedRow(row)}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {paginated && totalPages > 1 && (
        <div className="nexus-pagination">
          <button
            type="button"
            disabled={currentPage <= 1}
            aria-label="Önceki sayfa"
            onClick={() => setCurrentPage((p) => p - 1)}
            className="nexus-pagination-btn"
          >
            Önceki
          </button>
          <span className="nexus-pagination-info">
            Sayfa {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            aria-label="Sonraki sayfa"
            onClick={() => setCurrentPage((p) => p + 1)}
            className="nexus-pagination-btn"
          >
            Sonraki
          </button>
        </div>
      )}
    </div>
  );
}
