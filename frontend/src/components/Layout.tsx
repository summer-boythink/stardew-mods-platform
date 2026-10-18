import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { IButton } from './island';

export function Layout({ children }: { children: React.ReactNode }): JSX.Element {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const linkCls = ({ isActive }: { isActive: boolean }): string => `nav-link${isActive ? ' active' : ''}`;

  const close = (): void => setMenuOpen(false);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" onClick={close}>
            <span className="brand-emoji" aria-hidden>
              🌸
            </span>
            <span>
              <span className="brand-text">星露谷 Mod 花帖</span>
              <span className="brand-sub">スターデュー交流帖</span>
            </span>
          </Link>
          <button className="menu-toggle" aria-label="菜单" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            {menuOpen ? '✕' : '☰'}
          </button>
          <nav className={`topnav${menuOpen ? ' open' : ''}`}>
            <NavLink to="/" className={linkCls} onClick={close} end>
              广场
            </NavLink>
            <NavLink to="/upload" className={linkCls} onClick={close}>
              上传
            </NavLink>
            <NavLink to="/mine" className={linkCls} onClick={close}>
              我的空间
            </NavLink>
            <NavLink to="/teams" className={linkCls} onClick={close}>
              团队
            </NavLink>
            <span className="nav-spacer" />
            {user ? (
              <>
                <span className="nav-user">👩‍🌾 {user.username}</span>
                <IButton
                  islandType="ghost"
                  onClick={() => {
                    logout();
                    close();
                    navigate('/');
                  }}
                >
                  退出
                </IButton>
              </>
            ) : (
              <Link to="/auth" onClick={close} className="nav-cta-link">
                <IButton islandType="primary">登录 / 注册</IButton>
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="main">{children}</main>
      <footer className="footer">
        <span>❀ 星露谷 Mod 花帖 ❀ 电脑・手机皆可 ・ 自动整理 manifest ・ 个人 / 团队 / 公开存储 ❀</span>
      </footer>
    </div>
  );
}
