import { Component, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AuthProvider } from './context/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { HomePage } from './pages/HomePage';
import { ModDetailPage } from './pages/ModDetailPage';
import { MyModsPage } from './pages/MyModsPage';
import { TeamPage } from './pages/TeamPage';
import { UploadPage } from './pages/UploadPage';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };

  static getDerivedStateFromError(err: unknown): { error: string } {
    return { error: err instanceof Error ? err.message : '页面出错了' };
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="page">
          <div className="state-error">页面出错：{this.state.error}</div>
          <button className="btn" onClick={() => this.setState({ error: '' })}>
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Layout>
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
  );
}
