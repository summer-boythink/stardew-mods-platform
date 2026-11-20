import { useEffect, useState, type ReactNode } from 'react';
import {
  Avatar,
  Divider,
  Drawer,
  IconButton,
  PixelIcon,
  PixelSprite,
  useSound,
  useToast,
  type PixelIconName,
} from '@pixelvale/ui';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { nextTheme, THEME_META, type AppTheme } from '../theme';

interface NavItem {
  to: string;
  label: string;
  icon: PixelIconName;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '广场', icon: 'leaf', end: true },
  { to: '/upload', label: '上传', icon: 'upload' },
  { to: '/mine', label: '我的空间', icon: 'file' },
  { to: '/teams', label: '团队', icon: 'heart' },
];

const THEME_ORDER_LABEL: Record<AppTheme, string> = {
  day: '白天',
  autumn: '秋日',
  night: '夜晚',
};

function MenuGlyph(): JSX.Element {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="square"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }): JSX.Element {
  return (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `app-nav__link${isActive ? ' app-nav__link--active' : ''}`
          }
        >
          <PixelIcon name={item.icon} size={16} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </>
  );
}

/** Thumb-friendly primary navigation for phones; hidden above 900px. */
function MobileTabBar(): JSX.Element {
  const location = useLocation();
  const detailPage = location.pathname.startsWith('/mods/');

  return (
    <nav className="mobile-tabbar" aria-label="底部快捷导航">
      {NAV_ITEMS.map((item) => {
        // A mod detail still belongs to the plaza tab.
        const current = location.pathname === item.to;
        const active = current || (item.to === '/' && detailPage);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`mobile-tabbar__link${active ? ' mobile-tabbar__link--active' : ''}`}
            aria-current={current ? 'page' : undefined}
            onClick={(event) => {
              // Tapping the tab for the route you are already on is the usual
              // "back to top" gesture. A detail page highlights 广场 but still
              // needs the link to navigate home.
              if (!current) return;
              event.preventDefault();
              const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
              window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
            }}
          >
            <span className="mobile-tabbar__icon" aria-hidden="true">
              <PixelIcon name={item.icon} size={20} />
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Layout({
  children,
  theme,
  onThemeChange,
}: {
  children: ReactNode;
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
}): JSX.Element {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { enabled, setEnabled, play } = useSound();
  const { toast } = useToast();
  const themeMeta = THEME_META[theme];
  // Auth is a focused task; the tab bar would only compete with the form.
  const hideTabBar = location.pathname === '/auth';

  useEffect(() => {
    setMenuOpen(false);
    // React Router keeps the previous scroll position by default; on phones
    // that looks like the next page opened halfway down.
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  const cycleTheme = (): void => {
    play('click');
    onThemeChange(nextTheme(theme));
  };

  const toggleSound = (): void => {
    if (enabled) {
      play('toggle');
      setEnabled(false);
      toast({ title: '界面音效已关闭', variant: 'info', duration: 2200 });
    } else {
      setEnabled(true);
      toast({ title: '界面音效已开启', variant: 'success', duration: 2200 });
    }
  };

  const signOut = (): void => {
    logout();
    setMenuOpen(false);
    navigate('/');
    toast({ title: '已退出登录，欢迎下次再来', variant: 'info' });
  };

  return (
    <div className={`app-shell${hideTabBar ? ' app-shell--no-tabbar' : ''}`}>
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>

      <div className="farm-scene" aria-hidden="true">
        <span className="farm-stars" />
        <span className="farm-celestial" />
        <span className="farm-cloud farm-cloud--one" />
        <span className="farm-cloud farm-cloud--two" />
        <span className="farm-cloud farm-cloud--three" />
        <span className="farm-hill farm-hill--back" />
        <span className="farm-hill farm-hill--front" />
        <span className="farm-grass" />
      </div>

      <header className="app-header">
        <div className="app-header__bar">
          <Link to="/" className="app-brand" aria-label="星露谷 Mod 花帖 · 回到广场">
            <span className="app-brand__mark">
              <PixelSprite name="parsnip" size={30} />
            </span>
            <span className="app-brand__text">
              <span className="app-brand__name">星露谷 Mod 花帖</span>
              <span className="app-brand__tag">STARDEW MODS · 谷仓集市</span>
            </span>
          </Link>

          <nav className="app-nav" aria-label="主导航">
            <NavItems />
          </nav>

          <div className="app-header__actions">
            {user ? (
              <span className="app-user" title={user.username}>
                <Avatar name={user.username} size="sm" />
                <span className="app-user__name">{user.username}</span>
              </span>
            ) : !loading ? (
              <Link to="/auth" className="pv-btn pv-btn--primary pv-btn--sm app-login">
                登录 / 注册
              </Link>
            ) : null}

            <IconButton
              label={`切换到${THEME_META[nextTheme(theme)].label}主题（当前${themeMeta.label}）`}
              variant="ghost"
              size="sm"
              className="app-header__icon"
              onClick={cycleTheme}
            >
              <PixelIcon name={themeMeta.icon} size={18} />
            </IconButton>
            <IconButton
              label={enabled ? '关闭界面音效' : '开启界面音效'}
              variant="ghost"
              size="sm"
              className="app-header__icon"
              onClick={toggleSound}
              aria-pressed={enabled}
            >
              <PixelIcon name={enabled ? 'volume-on' : 'volume-off'} size={18} />
            </IconButton>
            <IconButton
              label="打开导航菜单"
              variant="ghost"
              size="sm"
              className="app-menu-button"
              onClick={() => setMenuOpen(true)}
            >
              <MenuGlyph />
            </IconButton>
          </div>
        </div>
      </header>

      <main className="app-main" id="main">
        {children}
      </main>

      <footer className="app-footer">
        <Divider />
        <div className="app-footer__inner">
          <p>
            <PixelSprite name="strawberry" size={16} /> 星露谷 Mod 花帖 · 让每一份 Mod
            都被好好收进谷仓
          </p>
          <p className="app-footer__meta">
            电脑 / 手机皆可使用 · 自动整理 manifest · 个人 / 团队 / 公开存储
          </p>
          <p className="app-footer__meta">
            像素界面由{' '}
            <a href="https://summer-boythink.github.io/pixelvale-ui/" target="_blank" rel="noreferrer">
              Pixelvale UI
            </a>{' '}
            提供 · 原创像素素材，不含游戏资源 ·{' '}
            <a href={`${import.meta.env.BASE_URL}FUSION-PIXEL-OFL.txt`} target="_blank" rel="noreferrer">
              字体 OFL
            </a>
          </p>
        </div>
      </footer>

      {hideTabBar ? null : <MobileTabBar />}

      <Drawer
        open={menuOpen}
        onOpenChange={setMenuOpen}
        side="right"
        width="sm"
        title="谷仓导航"
        description={user ? `你好，${user.username}` : '登录后可使用完整功能'}
        icon={<PixelSprite name="coin" size={22} />}
      >
        <nav className="drawer-nav" aria-label="移动端导航">
          <NavItems onNavigate={() => setMenuOpen(false)} />
        </nav>

        <div className="drawer-section">
          <p className="drawer-section__title">外观与声音</p>
          <div className="drawer-row">
            <span>主题：{THEME_ORDER_LABEL[theme]}</span>
            <IconButton label="切换主题" variant="wood" size="sm" onClick={cycleTheme}>
              <PixelIcon name={themeMeta.icon} size={16} />
            </IconButton>
          </div>
          <div className="drawer-row">
            <span>界面音效：{enabled ? '开' : '关'}</span>
            <IconButton
              label={enabled ? '关闭界面音效' : '开启界面音效'}
              variant="wood"
              size="sm"
              onClick={toggleSound}
            >
              <PixelIcon name={enabled ? 'volume-on' : 'volume-off'} size={16} />
            </IconButton>
          </div>
        </div>

        <div className="drawer-section">
          {user ? (
            <>
              <div className="drawer-user">
                <Avatar name={user.username} />
                <div>
                  <strong>{user.username}</strong>
                  <p className="muted">个人空间 2GB · 团队空间 10GB</p>
                </div>
              </div>
              <button type="button" className="pv-btn pv-btn--default pv-btn--full" onClick={signOut}>
                退出登录
              </button>
            </>
          ) : (
            <Link
              to="/auth"
              className="pv-btn pv-btn--primary pv-btn--full"
              onClick={() => setMenuOpen(false)}
            >
              登录 / 注册
            </Link>
          )}
        </div>
      </Drawer>
    </div>
  );
}
