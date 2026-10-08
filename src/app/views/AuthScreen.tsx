import { useState } from "react";
import { api } from "../api";
import type { User } from "../types";

interface AuthScreenProps {
  signupCodeRequired: boolean;
  version: string;
  onAuthenticated: (user: User) => void;
}

export function AuthScreen({ signupCodeRequired, version, onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (isRegister && password !== password2) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    try {
      const payload = isRegister
        ? await api.register({ username, displayName, password, signupCode })
        : await api.login(username, password);
      onAuthenticated(payload.user);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <img className="brand-mark" src="/icon.svg" alt="" />
          <span className="brand-name">途迹 TripTrace</span>
        </div>
      </header>
      <main className="page">
        <section className="card auth-card">
          <h1>{isRegister ? "创建账号" : "登录途迹"}</h1>
          <p className="small muted">记录每日出差行程的节点与里程，历史路线会自动帮你补全距离。</p>

          <div className="switcher">
            <button
              type="button"
              className={isRegister ? "" : "is-active"}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              登录
            </button>
            <button
              type="button"
              className={isRegister ? "is-active" : ""}
              onClick={() => {
                setMode("register");
                setError("");
              }}
            >
              注册
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="field-label" htmlFor="auth-username">
                用户名
              </label>
              <input
                id="auth-username"
                className="input"
                autoComplete="username"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>

            {isRegister ? (
              <div className="field">
                <label className="field-label" htmlFor="auth-display">
                  显示名（可选）
                </label>
                <input
                  id="auth-display"
                  className="input"
                  autoComplete="nickname"
                  placeholder="例如：小王"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </div>
            ) : null}

            <div className="field">
              <label className="field-label" htmlFor="auth-password">
                密码
              </label>
              <input
                id="auth-password"
                className="input"
                type="password"
                autoComplete={isRegister ? "new-password" : "current-password"}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            {isRegister ? (
              <>
                <div className="field">
                  <label className="field-label" htmlFor="auth-password2">
                    确认密码
                  </label>
                  <input
                    id="auth-password2"
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password2}
                    onChange={(event) => setPassword2(event.target.value)}
                  />
                </div>
                {signupCodeRequired ? (
                  <div className="field">
                    <label className="field-label" htmlFor="auth-code">
                      邀请码
                    </label>
                    <input
                      id="auth-code"
                      className="input"
                      required
                      value={signupCode}
                      onChange={(event) => setSignupCode(event.target.value)}
                    />
                  </div>
                ) : null}
              </>
            ) : null}

            <p className="form-error">{error}</p>
            <div className="actions">
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "处理中…" : isRegister ? "注册并登录" : "登录"}
              </button>
            </div>
          </form>

          <p className="tiny muted">
            登录状态保存在本设备（HttpOnly Cookie，400 天滚动续期），日常使用不会失效。
          </p>
          <p className="footer">途迹 TripTrace v{version}</p>
        </section>
      </main>
    </div>
  );
}
