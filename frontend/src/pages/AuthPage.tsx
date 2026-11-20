import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Panel,
  PixelIcon,
  PixelSprite,
  Spinner,
  Stat,
  Tabs,
  TextField,
  useToast,
} from '@pixelvale/ui';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, apiCaptcha, apiLogin, apiRegister } from '../api/client';
import { PageHeading } from '../components/PageHeading';
import { useAuth } from '../context/AuthContext';

type AuthMode = 'login' | 'register';

const TABS = [
  { value: 'login', label: '登录' },
  { value: 'register', label: '注册' },
];

export function AuthPage(): JSX.Element {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [captchaCode, setCaptchaCode] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaSvg, setCaptchaSvg] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    try {
      const captcha = await apiCaptcha();
      setCaptchaId(captcha.captchaId);
      setCaptchaSvg(captcha.svg);
      setCaptchaCode('');
    } catch {
      // 验证码刷不出来时允许稍后重试，不阻断输入
      setCaptchaSvg('');
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCaptcha();
  }, [loadCaptcha, mode]);

  const formatLockout = (err: ApiError): string => {
    if (err.status === 429 && typeof err.retryAfter === 'number') {
      const mins = Math.max(1, Math.ceil(err.retryAfter / 60));
      return `${err.message}（约 ${mins} 分钟后可重试）`;
    }
    return err.message;
  };

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError('');
    if (username.trim().length < 2) {
      setError('用户名至少 2 个字符');
      return;
    }
    if (mode === 'register') {
      if (password.length < 6) {
        setError('密码至少 6 位');
        return;
      }
      if (password !== confirmPassword) {
        setError('两次输入的密码不一致');
        return;
      }
    } else if (password.length === 0) {
      setError('请输入密码');
      return;
    }
    if (!captchaId || captchaCode.trim().length === 0) {
      setError('请填写图形验证码');
      return;
    }

    setBusy(true);
    try {
      const result =
        mode === 'login'
          ? await apiLogin(username.trim(), password, captchaId, captchaCode.trim())
          : await apiRegister(
              username.trim(),
              password,
              confirmPassword,
              captchaId,
              captchaCode.trim(),
            );
      login(result.token, result.user);
      toast({
        variant: 'success',
        title: mode === 'login' ? `欢迎回来，${result.user.username}` : '注册成功，欢迎加入',
        description: '个人空间和团队谷仓已经为你准备好了。',
      });
      navigate('/');
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError(0, '请求失败');
      setError(formatLockout(apiErr));
      // 验证码一次性：失败后刷新，避免用户对着过期验证码重试
      void loadCaptcha();
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: string): void => {
    setMode(next as AuthMode);
    setError('');
  };

  return (
    <div className="page-stack auth-page">
      <PageHeading
        eyebrow="谷仓通行证"
        title={mode === 'login' ? '欢迎回到花帖' : '加入 Mod 岛'}
        description="登录后可以使用个人空间（2GB）、创建团队空间（10GB），并发布公开 Mod。"
      />

      <div className="auth-grid">
        <Panel
          className="auth-card"
          title={mode === 'login' ? '登录' : '创建新账号'}
          subtitle={mode === 'login' ? '用你的农夫名继续整理 Mod。' : '注册后即可获得 2GB 个人谷仓。'}
          icon={<PixelSprite name={mode === 'login' ? 'parsnip' : 'strawberry'} size={22} />}
          headingLevel={2}
        >
          <Tabs items={TABS} value={mode} onValueChange={switchMode} label="登录或注册" />

          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            <TextField
              label="用户名"
              value={username}
              maxLength={24}
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="中英文 / 数字 / 下划线，2-24 位"
              hint="用户名会展示在公开 Mod 的作者栏。"
            />

            <TextField
              label={mode === 'register' ? '密码（至少 6 位）' : '密码'}
              type="password"
              value={password}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === 'register' ? '至少 6 位' : '你的密码'}
            />

            {mode === 'register' ? (
              <TextField
                label="确认密码"
                type="password"
                value={confirmPassword}
                autoComplete="new-password"
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再输入一遍密码"
              />
            ) : null}

            <div className="captcha-field">
              <span className="field-label">图形验证码</span>
              <div className="captcha-row">
                <TextField
                  value={captchaCode}
                  maxLength={8}
                  autoComplete="off"
                  inputMode="text"
                  onChange={(event) => setCaptchaCode(event.target.value)}
                  placeholder="填入右侧图画上的字符"
                  aria-label="图形验证码"
                />
                <button
                  type="button"
                  className="captcha-tile"
                  onClick={() => void loadCaptcha()}
                  title="点击刷新验证码"
                  aria-label="点击刷新图形验证码"
                  disabled={captchaLoading}
                >
                  {captchaSvg ? (
                    // ISO-SVG comes from our own captcha endpoint, never user input.
                    <span
                      className="captcha-tile__svg"
                      dangerouslySetInnerHTML={{ __html: captchaSvg }}
                    />
                  ) : captchaLoading ? (
                    <Spinner size="sm" showLabel label="验证码加载中" />
                  ) : (
                    <span className="captcha-tile__retry">
                      <PixelIcon name="clock" size={16} />
                      点击获取
                    </span>
                  )}
                </button>
              </div>
              <p className="field-hint">验证码 5 分钟内有效，用过即失效；看不清就点击图画刷新。</p>
            </div>

            {error ? (
              <Alert variant="error" title="没有成功，请检查一下">
                {error}
              </Alert>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={busy}
              leftIcon={<PixelIcon name="sparkle" size={18} />}
            >
              {mode === 'login' ? '登录花帖' : '注册并登录'}
            </Button>

            <p className="field-hint">
              为保护账号安全：同一 IP 或账号每 1 小时累计失败 5 次会被暂时锁定。
            </p>
          </form>
        </Panel>

        <div className="auth-aside">
          <Panel
            title="谷仓里有什么"
            subtitle="一个账号，三种存放方式"
            icon={<PixelIcon name="leaf" size={18} />}
            headingLevel={2}
          >
            <div className="auth-benefits">
              <div className="auth-benefit">
                <PixelSprite name="parsnip" size={28} />
                <div>
                  <strong>个人谷仓 · 2GB</strong>
                  <p>默认私有，想分享时再单独公开。</p>
                </div>
              </div>
              <div className="auth-benefit">
                <PixelIcon name="heart" size={22} />
                <div>
                  <strong>团队手帖 · 10GB</strong>
                  <p>邀请伙伴一起整理，成员共享 Mod。</p>
                </div>
              </div>
              <div className="auth-benefit">
                <PixelIcon name="sparkle" size={22} />
                <div>
                  <strong>自动整理</strong>
                  <p>解析 manifest、分类、生成文件树与预览图。</p>
                </div>
              </div>
            </div>
            <div className="auth-stats">
              <Stat label="个人空间" value="2 GB" hint="注册即得" tone="success" />
              <Stat label="团队空间" value="10 GB" hint="创建团队后启用" tone="gold" />
            </div>
          </Panel>

          <Panel
            title="第一次来？"
            icon={<PixelIcon name="info" size={18} />}
            headingLevel={2}
            className="auth-note"
          >
            <p>
              先注册一个账号，再到 <Link to="/upload">上传页</Link> 选择空间和文件。
              平台会自动读取 <span className="mono">manifest.json</span>
              ，把合集包拆成清单，并生成可下载的压缩包。
            </p>
            <p className="muted">已有账号？直接在上方切换到「登录」即可。</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
