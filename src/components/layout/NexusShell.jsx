import {
  IconAdjustmentsHorizontal,
  IconArchive,
  IconChartBar,
  IconChevronDown,
  IconCircleCheck,
  IconClipboardCheck,
  IconDatabase,
  IconFish,
  IconLayoutDashboard,
  IconLogout,
  IconMenu2,
  IconPackage,
  IconSettings,
  IconShieldCheck,
  IconX,
} from "@tabler/icons-react";
import "./NexusShell.css";

const NAV_GROUPS = [
  {
    label: "Yönetim",
    pages: ["summary", "sales", "departments"],
  },
  {
    label: "Kontrol merkezi",
    pages: ["audit", "inventory", "ledger"],
  },
  {
    label: "Yapılandırma",
    pages: ["settings"],
  },
];

const PAGE_CONTEXT = {
  summary: {
    group: "Yönetim özeti",
    description: "Finansal ve operasyonel görünüm",
  },
  sales: {
    group: "Yönetim özeti",
    description: "Satış, iade ve maliyet kapsamı",
  },
  departments: {
    group: "Yönetim özeti",
    description: "Departman hedefleri ve performans",
  },
  audit: {
    group: "Kontrol merkezi",
    description: "Kaynak, maliyet ve kanıt durumu",
  },
  inventory: {
    group: "Kontrol merkezi",
    description: "Stok hareketleri ve araştırma",
  },
  ledger: {
    group: "Kontrol merkezi",
    description: "Dağıtıma esas kâr ve havuz",
  },
  settings: {
    group: "Yapılandırma",
    description: "Politikalar, hedefler ve çalışma ayarları",
  },
};

const PAGE_ICONS = {
  summary: IconLayoutDashboard,
  sales: IconChartBar,
  departments: IconClipboardCheck,
  audit: IconShieldCheck,
  inventory: IconPackage,
  ledger: IconArchive,
  settings: IconSettings,
};

function groupItems(items) {
  const itemByPage = new Map(items.map((item) => [item.page, item]));
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.pages.map((page) => itemByPage.get(page)).filter(Boolean),
  })).filter((group) => group.items.length > 0);
}

function userLabel(user) {
  return user?.displayName || user?.name || user?.username || "Yetkili kullanıcı";
}

export function NexusShell({
  activePage,
  navItems,
  onNavigate,
  year,
  onYearChange,
  onOpenAppearance,
  onSignOut,
  user,
  connection,
  mode,
  density = "comfortable",
  mobileNavOpen,
  onMobileNavToggle,
  onMobileNavClose,
  children,
}) {
  const activeItem = navItems.find((item) => item.page === activePage) || navItems[0];
  const context = PAGE_CONTEXT[activeItem?.page] || PAGE_CONTEXT.summary;
  const groups = groupItems(navItems);
  const readOnly = connection?.readOnly !== false;

  return (
    <div className={`nexus-shell app-shell density-${density}`}>
      <a className="nexus-shell__skip-link" href="#nexus-main">İçeriğe geç</a>
      <aside className={mobileNavOpen ? "nexus-shell__sidebar nexus-shell__sidebar--open" : "nexus-shell__sidebar"}>
        <div className="nexus-shell__brand-wrap">
          <a className="nexus-shell__brand" href="#top" onClick={onMobileNavClose} aria-label="Marlin Nexus Yönetim Sistemi">
            <span className="nexus-shell__brand-mark"><IconFish size={26} stroke={1.6} /></span>
            <span className="nexus-shell__brand-copy">
              <strong>Marlin Nexus</strong>
              <small>Yönetim Sistemi</small>
            </span>
          </a>
          <button className="nexus-shell__close-nav" type="button" onClick={onMobileNavClose} aria-label="Menüyü kapat">
            <IconX size={20} />
          </button>
        </div>

        <div className="nexus-shell__sidebar-intro">
          <span className="nexus-shell__sidebar-kicker">Executive command center</span>
          <strong>Çalışma alanı</strong>
        </div>

        <nav id="nexus-navigation" className="nexus-shell__nav" aria-label="Ana menü">
          {groups.map((group) => (
            <section className="nexus-shell__nav-group" key={group.label}>
              <h2>{group.label}</h2>
              <div className="nexus-shell__nav-items">
                {group.items.map((item) => {
                  const Icon = PAGE_ICONS[item.page] || IconDatabase;
                  const isActive = item.page === activePage;
                  return (
                    <button
                      className={isActive ? "nexus-shell__nav-item nexus-shell__nav-item--active" : "nexus-shell__nav-item"}
                      key={item.page}
                      type="button"
                      onClick={() => onNavigate(item.page)}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon size={18} stroke={isActive ? 2.1 : 1.8} />
                      <span>{item.label}</span>
                      {isActive && <IconCircleCheck className="nexus-shell__nav-check" size={15} />}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="nexus-shell__sidebar-footer">
          <div className="nexus-shell__source-note">
            <span className="nexus-shell__source-icon"><IconDatabase size={16} /></span>
            <span><strong>CPM salt okunur</strong><small>{connection?.connected ? "Canlı bağlantı" : "Güvenli pilot veri"}</small></span>
          </div>
          <div className="nexus-shell__user-card">
            <span className="nexus-shell__avatar" aria-hidden="true">{userLabel(user).slice(0, 1).toUpperCase()}</span>
            <span><strong>{userLabel(user)}</strong><small>{user?.role === "admin" ? "Yönetici" : "Yetkili kullanıcı"}</small></span>
          </div>
        </div>
      </aside>

      {mobileNavOpen && <button className="nexus-shell__scrim" type="button" onClick={onMobileNavClose} aria-label="Menüyü kapat" />}

      <div className="nexus-shell__workspace">
        <header className="nexus-shell__topbar">
          <button className="nexus-shell__menu" type="button" onClick={onMobileNavToggle} aria-label={mobileNavOpen ? "Menüyü kapat" : "Menüyü aç"} aria-expanded={mobileNavOpen} aria-controls="nexus-navigation">
            {mobileNavOpen ? <IconX size={21} /> : <IconMenu2 size={21} />}
          </button>
          <div className="nexus-shell__mobile-brand" aria-label="Marlin Nexus">
            <IconFish size={22} stroke={1.6} />
            <strong>Marlin Nexus</strong>
          </div>
          <div className="nexus-shell__topbar-status">
            <span className="nexus-shell__status-dot" />
            <span>{readOnly ? "Salt okunur" : "Bağlantı kontrolü"}</span>
          </div>
          <div className="nexus-shell__topbar-actions">
            <label className="nexus-shell__year-control">
              <span>Rapor yılı</span>
              <select aria-label="Rapor yılı" value={year} onChange={(event) => onYearChange(Number(event.target.value))}>
                {[2024, 2025, 2026].map((item) => <option key={item}>{item}</option>)}
              </select>
              <IconChevronDown size={15} aria-hidden="true" />
            </label>
            <button className="nexus-shell__action" type="button" onClick={onOpenAppearance} aria-label="Görünüm ayarları">
              <IconAdjustmentsHorizontal size={18} />
              <span>Görünüm</span>
            </button>
            <button className="nexus-shell__action nexus-shell__action--logout" type="button" onClick={onSignOut} aria-label="Çıkış yap">
              <IconLogout size={18} />
              <span>Çıkış</span>
            </button>
          </div>
        </header>

        <header className="nexus-shell__context-header">
          <div>
            <p className="nexus-shell__context-kicker">{context.group}</p>
            <h1>{activeItem?.label || "Marlin Nexus"}</h1>
            <p className="nexus-shell__context-description">{context.description}</p>
          </div>
          <div className="nexus-shell__context-meta">
            <span className="nexus-shell__mode-chip"><span className="nexus-shell__mode-dot" />{mode === "live" ? "Canlı CPM" : mode === "loading" ? "Veri yükleniyor" : "Pilot / inceleme"}</span>
            <span className="nexus-shell__year-chip">{year} dönemi</span>
          </div>
        </header>

        <div className="nexus-shell__main" id="nexus-main" role="region" aria-label="Ana içerik">
          {children}
        </div>
      </div>
    </div>
  );
}
