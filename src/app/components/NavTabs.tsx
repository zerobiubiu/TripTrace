import type { TabKey } from "../types";

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: "entry", label: "填报", icon: "✎" },
  { key: "records", label: "记录", icon: "☰" },
  { key: "stats", label: "汇总", icon: "◎" },
  { key: "import", label: "导入", icon: "⇪" },
];

/** 移动端是底部导航；≥900px 由 CSS 变成左侧竖排导航。 */
export function NavTabs({ active, onChange }: { active: TabKey; onChange: (tab: TabKey) => void }) {
  return (
    <nav className="nav" aria-label="主导航">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={tab.key === active ? "nav-item is-active" : "nav-item"}
          aria-current={tab.key === active ? "page" : undefined}
          onClick={() => onChange(tab.key)}
        >
          <span className="nav-icon" aria-hidden="true">
            {tab.icon}
          </span>
          <span className="nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
