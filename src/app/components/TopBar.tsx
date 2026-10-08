import type { User } from "../types";

interface TopBarProps {
  user: User;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onOpenPassword: () => void;
  onExport: () => void;
  onLogout: () => void;
}

export function TopBar({ user, menuOpen, onToggleMenu, onOpenPassword, onExport, onLogout }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <img className="brand-mark" src="/icon.svg" alt="" />
        <span className="brand-name">途迹</span>
      </div>
      <div className="topbar-actions">
        <span className="who">{user.displayName}</span>
        <div className="menu-wrap">
          <button
            type="button"
            className="icon-btn"
            aria-label="更多操作"
            aria-expanded={menuOpen}
            onClick={onToggleMenu}
          >
            ⋯
          </button>
          {menuOpen ? (
            <div className="menu" role="menu">
              <button type="button" role="menuitem" onClick={onOpenPassword}>
                修改密码
              </button>
              <button type="button" role="menuitem" onClick={onExport}>
                导出数据（JSON）
              </button>
              <button type="button" role="menuitem" onClick={onLogout}>
                退出登录
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
