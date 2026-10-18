import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiCaptcha, apiLogin, apiRegister } from '../api/client';
import { IButton, ICard } from '../components/island';
import { useAuth } from '../context/AuthContext';

export function AuthPage(): JSX.Element {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
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
      const c = await apiCaptcha();
      setCaptchaId(c.captchaId);
      setCaptchaSvg(c.svg);
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

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
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
      const r =
        mode === 'login'
          ? await apiLogin(username.trim(), password, captchaId, captchaCode.trim())
          : await apiRegister(username.trim(), password, confirmPassword, captchaId, captchaCode.trim());
      login(r.token, r.user);
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

  return (
    <div className="page auth-page">
      <ICard>
        <h2 className="page-title">{mode === 'login' ? '👩‍🌾 欢迎回来' : '🌱 加入 Mod 岛'}</h2>
        <p className="muted">登录后可使用个人空间（2GB）、创建团队空间（10GB）并发布公开 Mod。</p>
        <div className="chip-row">
          <button
            className={`chip${mode === 'login' ? ' active' : ''}`}
            onClick={() => {
              setMode('login');
              setError('');
            }}
          >
            登录
          </button>
          <button
            className={`chip${mode === 'register' ? ' active' : ''}`}
            onClick={() => {
              setMode('register');
              setError('');
            }}
          >
            注册
          </button>
        </div>
        <form className="form-grid" onSubmit={(e) => void submit(e)}>
          <label>
            用户名
            <input
              className="input"
              value={username}
              maxLength={24}
              autoComplete="username"
              onChange={(e) => setUsername(e.target.value)}
              placeholder="中英文/数字/下划线，2-24 位"
            />
          </label>
          <label>
            密码{mode === 'register' ? '（至少 6 位）' : ''}
            <input
              className="input"
              type="password"
              value={password}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? '至少 6 位' : '你的密码'}
            />
          </label>
          {mode === 'register' && (
            <label>
              确认密码
              <input
                className="input"
                type="password"
                value={confirmPassword}
                autoComplete="new-password"
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再输入一遍密码"
              />
            </label>
          )}
          <label>
            图形验证码
            <span className="captcha-row">
              <input
                className="input"
                value={captchaCode}
                maxLength={8}
                autoComplete="off"
                inputMode="text"
                onChange={(e) => setCaptchaCode(e.target.value)}
                placeholder="看不清可点击图片刷新"
                aria-label="图形验证码"
              />
              <button
                type="button"
                className="captcha-img"
                onClick={() => void loadCaptcha()}
                title="点击刷新验证码"
                aria-label="刷新验证码"
                disabled={captchaLoading}
              >
                {captchaSvg ? (
                  <span dangerouslySetInnerHTML={{ __html: captchaSvg }} />
                ) : (
                  <span className="muted">{captchaLoading ? '加载中…' : '点击获取'}</span>
                )}
              </button>
            </span>
          </label>
          {error && <div className="state-error">{error}</div>}
          <IButton islandType="primary" loading={busy}>
            {mode === 'login' ? '登录' : '注册并登录'}
          </IButton>
          <p className="muted">🌸 为保护账号安全：登录每 1 小时内失败超过 5 次将被暂时锁定（按 IP 与账号双重计数）。</p>
        </form>
      </ICard>
    </div>
  );
}
