/** 「账号」页：修改显示名、查看/登出登录设备、进入修改密码。 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import LockOutlined from "@mui/icons-material/LockOutlined";
import type { SessionRow } from "@triptrace/contracts";
import { api, isUnauthorized } from "../api";
import { formatDateTimeLabel, normalizeName, userAgentLabel } from "../lib/format";
import type { UserDto } from "../types";

/** 轻提示：severity 决定提示样式，action 用于可恢复操作。 */
type Notify = (
  message: string,
  severity?: "success" | "info" | "warning" | "error",
  action?: { label: string; run: () => void },
) => void;

interface AccountViewProps {
  user: UserDto;
  onOpenPassword: () => void;
  notify: Notify;
  onUserChanged: (user: UserDto) => void;
  /**
   * 会话失效（401）时通知主进程（跳回登录）。不传也可以：页面只保留原有错误态，
   * 这在未接线/独立渲染时不会报错。
   */
  onSessionInvalid?: () => void;
}

/** 主题桌面端按钮只有 40px 高，这里保证可点区域 ≥44px。 */
const TOUCH_SX = { minHeight: 44 };

interface SessionsCardProps {
  /** null = 加载中 */
  sessions: SessionRow[] | null;
  error: string;
  /** 正在退出的会话 id */
  revokingId: string | null;
  onRetry: () => void;
  onRevoke: (session: SessionRow) => void;
}

/**
 * 登录设备卡片（纯展示）：数据获取与副作用都留在 AccountView，
 * 本组件只按传入状态渲染，空态/错误态因此可以不依赖 useEffect 单独渲染。
 */
export function SessionsCard({ sessions, error, revokingId, onRetry, onRevoke }: SessionsCardProps) {
  if (error) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" sx={TOUCH_SX} aria-label="重试加载登录设备" onClick={onRetry}>
            重试
          </Button>
        }
      >
        {error}
      </Alert>
    );
  }

  if (sessions === null) {
    return (
      <Stack spacing={1.5}>
        <Skeleton variant="rounded" height={56} />
        <Skeleton variant="rounded" height={56} />
      </Stack>
    );
  }

  if (sessions.length === 0) {
    return <Alert severity="info">暂无登录设备记录。</Alert>;
  }

  return (
    <Stack spacing={1.5} component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
      {sessions.map((session) => (
        <Box component="li" key={session.id}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
            <Box sx={{ minWidth: 0, flex: "1 1 200px" }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {userAgentLabel(session.userAgent)}
                </Typography>
                {session.current ? (
                  <Chip size="small" color="success" label="当前设备" />
                ) : null}
              </Stack>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                最近活跃：{formatDateTimeLabel(session.lastSeenAt)}
              </Typography>
            </Box>

            {session.current ? null : (
              <Button
                size="small"
                color="error"
                sx={TOUCH_SX}
                disabled={revokingId === session.id}
                aria-label={`登出该设备：${userAgentLabel(session.userAgent)}`}
                onClick={() => onRevoke(session)}
              >
                {revokingId === session.id ? "退出中…" : "登出"}
              </Button>
            )}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

export function AccountView({ user, onOpenPassword, notify, onUserChanged, onSessionInvalid }: AccountViewProps) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [sessionsError, setSessionsError] = useState("");
  const [revokingId, setRevokingId] = useState<string | null>(null);

  /**
   * 401 交给主进程处理；父组件可能每次渲染都传新的内联函数，
   * 用 ref 保存最新一份，避免把它加进 loadSessions 依赖导致反复拉取设备列表。
   */
  const sessionInvalidRef = useRef(onSessionInvalid);
  useEffect(() => {
    sessionInvalidRef.current = onSessionInvalid;
  }, [onSessionInvalid]);

  // 保存成功或用户信息在外部刷新后，输入框跟随最新显示名
  useEffect(() => {
    setDisplayName(user.displayName);
  }, [user.displayName]);

  const loadSessions = useCallback(async () => {
    setSessions(null);
    setSessionsError("");
    try {
      const result = await api.listSessions();
      setSessions(result.sessions);
    } catch (error) {
      if (isUnauthorized(error)) {
        setSessionsError("登录已失效，请重新登录");
        sessionInvalidRef.current?.();
      } else {
        setSessionsError(error instanceof Error ? error.message : "登录设备加载失败，请稍后重试");
      }
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const normalized = normalizeName(displayName);
  const canSave = !saving && normalized.length > 0 && normalized !== user.displayName;

  const handleSaveName = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const result = await api.updateProfile({ displayName: normalized });
      onUserChanged(result.user);
      notify("显示名已更新", "success");
    } catch (error) {
      if (isUnauthorized(error)) sessionInvalidRef.current?.();
      notify(error instanceof Error ? error.message : "保存失败，请稍后重试", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (session: SessionRow) => {
    setRevokingId(session.id);
    try {
      await api.revokeSession(session.id);
      notify("已登出该设备", "success");
      await loadSessions();
    } catch (error) {
      const unauthorized = isUnauthorized(error);
      if (unauthorized) sessionInvalidRef.current?.();
      notify(
        unauthorized
          ? "登录已失效，请重新登录"
          : error instanceof Error
            ? error.message
            : "操作失败，请稍后重试",
        "error",
      );
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Typography variant="h3" component="h3" sx={{ mb: 1.5 }}>
            显示名
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: { sm: "center" } }}>
            <TextField
              label="显示名"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              fullWidth
            />
            <Button
              variant="contained"
              sx={{ ...TOUCH_SX, minWidth: 96 }}
              disabled={!canSave}
              aria-label="保存显示名"
              onClick={() => void handleSaveName()}
            >
              {saving ? "保存中…" : "保存"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h3" component="h3" sx={{ mb: 1.5 }}>
            登录设备
          </Typography>
          <SessionsCard
            sessions={sessions}
            error={sessionsError}
            revokingId={revokingId}
            onRetry={() => void loadSessions()}
            onRevoke={(session) => void handleRevoke(session)}
          />
        </CardContent>
      </Card>

      <Button
        variant="outlined"
        startIcon={<LockOutlined fontSize="small" />}
        sx={{ ...TOUCH_SX, alignSelf: "flex-start" }}
        aria-label="修改密码"
        onClick={onOpenPassword}
      >
        修改密码
      </Button>
    </Stack>
  );
}
