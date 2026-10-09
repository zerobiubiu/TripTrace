import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { api } from "../api";
import { radius } from "../theme";
import type { User } from "../types";

interface AuthScreenProps {
  signupCodeRequired: boolean;
  version: string;
  onAuthenticated: (user: User) => void | Promise<void>;
}

type AuthMode = "login" | "register";

export function AuthScreen({ signupCodeRequired, version, onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isRegister = mode === "register";
  const mismatch = isRegister && password2.length > 0 && password !== password2;

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
      await onAuthenticated(payload.user);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: AuthMode | null) => {
    // exclusive 模式下再次点击已选项会给出 null，此时保持当前模式
    if (next === null || next === mode) return;
    setMode(next);
    setError("");
  };

  return (
    <Box
      component="main"
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
      }}
    >
      <Card variant="outlined" sx={{ width: "100%", maxWidth: 420 }}>
        <CardContent>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Box
                component="img"
                src="/icon.svg"
                alt=""
                sx={{ width: 30, height: 30, display: "block", borderRadius: radius.icon }}
              />
              <Typography variant="h2" component="span">
                途迹 TripTrace
              </Typography>
            </Stack>

            <Typography variant="h1" component="h1">
              {isRegister ? "创建账号" : "登录途迹"}
            </Typography>

            {/* 首次进入的人（同事拿到链接）只看到表单不知道这是什么；两行说清「记什么、省什么」，
                不写实现细节，也不做引导流程——这个产品本身只有四个分组。 */}
            <Stack spacing={0.5}>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                记出差路线与里程：打开就是今天。
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                常跑的路线下次一键带出，月末不用手算。
              </Typography>
            </Stack>

            <ToggleButtonGroup
              exclusive
              fullWidth
              color="primary"
              value={mode}
              onChange={(_event, next: AuthMode | null) => switchMode(next)}
              aria-label="切换登录或注册"
            >
              <ToggleButton value="login">登录</ToggleButton>
              <ToggleButton value="register">注册</ToggleButton>
            </ToggleButtonGroup>

            <Box component="form" onSubmit={handleSubmit}>
              <Stack spacing={2}>
                <TextField
                  label="用户名"
                  autoComplete="username"
                  required
                  fullWidth
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />

                {isRegister ? (
                  <TextField
                    label="显示名（可选）"
                    autoComplete="nickname"
                    placeholder="例如：小王"
                    fullWidth
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                ) : null}

                <TextField
                  label="密码"
                  type="password"
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  required
                  fullWidth
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />

                {isRegister ? (
                  <>
                    <TextField
                      label="确认密码"
                      type="password"
                      autoComplete="new-password"
                      required
                      fullWidth
                      value={password2}
                      error={mismatch}
                      helperText={mismatch ? "两次输入的密码不一致" : undefined}
                      onChange={(event) => setPassword2(event.target.value)}
                    />
                    {signupCodeRequired ? (
                      <TextField
                        label="邀请码"
                        required
                        fullWidth
                        value={signupCode}
                        onChange={(event) => setSignupCode(event.target.value)}
                      />
                    ) : null}
                  </>
                ) : null}

                {error ? <Alert severity="error">{error}</Alert> : null}

                <Button type="submit" variant="contained" size="large" fullWidth disabled={busy}>
                  {busy ? "处理中…" : isRegister ? "注册并登录" : "登录"}
                </Button>
              </Stack>
            </Box>

            <Stack spacing={0.5} sx={{ textAlign: "center" }}>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                在这台设备上保持登录
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                途迹 TripTrace v{version}
              </Typography>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
