import { Component, useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, PixelValeProvider } from '@pixelvale/ui';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { FeedbackProvider } from './components/Feedback';
import { Layout } from './components/Layout';
import { AuthProvider } from './context/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { HomePage } from './pages/HomePage';
import { ModDetailPage } from './pages/ModDetailPage';
import { MyModsPage } from './pages/MyModsPage';
import { TeamPage } from './pages/TeamPage';
import { UploadPage } from './pages/UploadPage';
import { readStoredTheme, storeTheme, type AppTheme } from './theme';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };

  static getDerivedStateFromError(err: unknown): { error: string } {
    return { error: err instanceof Error ? err.message : '页面出错了' };
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="error-page">
          <Alert
            variant="error"
            title="页面出了一点问题"
            action={
              <Button onClick={() => this.setState({ error: '' })}>重试</Button>
            }
          >
            <p>{this.state.error}</p>
            <p className="muted">
              如果反复出现，可以 <a href="/">回到广场</a>，或检查后端服务是否正常。
            </p>
          </Alert>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App(): JSX.Element {
  const [theme, setTheme] = useState<AppTheme>(readStoredTheme);

  useEffect(() => {
    storeTheme(theme);
  }, [theme]);

  return (
    <PixelValeProvider
      theme={theme}
      locale="zh-CN"
      defaultSoundEnabled={false}
      className="app-root"
    >
      <FeedbackProvider>
        <BrowserRouter>
          <AuthProvider>
            <Layout theme={theme} onThemeChange={setTheme}>
              <ErrorBoundary>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/upload" element={<UploadPage />} />
                  <Route path="/mine" element={<MyModsPage />} />
                  <Route path="/teams" element={<TeamPage />} />
                  <Route path="/mods/:id" element={<ModDetailPage />} />
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </ErrorBoundary>
            </Layout>
          </AuthProvider>
        </BrowserRouter>
      </FeedbackProvider>
    </PixelValeProvider>
  );
}
