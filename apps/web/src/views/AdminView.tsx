/** 「管理」页（仅管理员）：用户列表，以及重置密码、禁用/启用、删除账号。 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { AdminUserRow } from "@triptrace/contracts";
import { api, isUnauthorized } from "../api";
import { formatDateTimeLabel, formatKm } from "../lib/format";

/** 轻提示：severity 决定提示样式，action 用于可恢复操作。 */
type Notify = (
  message: string,
  severity?: "success" | "info" | "warning" | "error",
  action?: { label: string; run: () => void },
) => void;

interface AdminViewProps {
  notify: Notify;
  onSessionInvalid: () => void;
  currentUserId: string;
}

/** 主题桌面端按钮只有 40px 高，这里保证可点区域 ≥44px。 */
const TOUCH_SX = { minHeight: 44 };
/** 表头不折行（「行程数」「合计里程」在窄屏会被拆成两行）。 */
const HEAD_SX = { fontWeight: 600, whiteSpace: "nowrap" } as const;
/** 数字列右对齐 + 等宽数字，与全站读数规则一致。 */
const NUM_SX = { fontVariantNumeric: "tabular-nums" } as const;

interface UserActionsProps {
  row: AdminUserRow;
  isSelf: boolean;
  onResetPassword: (row: AdminUserRow) => void;
  onToggleDisabled: (row: AdminUserRow) => void;
  onDelete: (row: AdminUserRow) => void;
}

/**
 * 行操作按钮：桌面表格行与手机卡片共用同一套（aria 命名、可点区域、自己那行的规则）。
 * 自己那一行不渲染禁用/删除。
 */
function UserActions({ row, isSelf, onResetPassword, onToggleDisabled, onDelete }: UserActionsProps) {
  const disabled = row.disabledAt !== null;
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", rowGap: 0.5 }}>
      <Button
        size="small"
        sx={TOUCH_SX}
        aria-label={`重置密码：${row.username}`}
        onClick={() => onResetPassword(row)}
      >
        重置密码
      </Button>
      {isSelf ? null : (
        <>
          <Button
            size="small"
            color={disabled ? "success" : "warning"}
            sx={TOUCH_SX}
            aria-label={`${disabled ? "启用" : "禁用"}账号：${row.username}`}
            onClick={() => onToggleDisabled(row)}
          >
            {disabled ? "启用" : "禁用"}
          </Button>
          <Button size="small" color="error" sx={TOUCH_SX} aria-label={`删除账号：${row.username}`} onClick={() => onDelete(row)}>
            删除
          </Button>
        </>
      )}
    </Stack>
  );
}

/** 与服务端 validatePassword 同一口径：8–200 位；返回空串表示通过。 */
function passwordIssue(value: string): string {
  if (value.length < 8) return "新密码至少 8 位";
  if (value.length > 200) return "新密码最多 200 位";
  return "";
}

export function AdminView({ notify, onSessionInvalid, currentUserId }: AdminViewProps) {
  const theme = useTheme();
  /** ≥1024（lg）表格形态；更窄（含 768–1023 的平板）用卡片形态，避免靠横向滚动找「操作」列。 */
  const isDesktop = useMediaQuery(theme.breakpoints.up("lg"));
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [resetTarget, setResetTarget] = useState<AdminUserRow | null>(null);
  const [toggleTarget, setToggleTarget] = useState<AdminUserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);
  const [password, setPassword] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadUsers = useCallback(async () => {
    setUsers(null);
    setLoadError("");
    try {
      const result = await api.adminListUsers();
      setUsers(result.users);
    } catch (error) {
      if (isUnauthorized(error)) {
        setLoadError("登录已失效，请重新登录");
        onSessionInvalid();
        return;
      }
      setLoadError(error instanceof Error ? error.message : "用户列表加载失败，请稍后重试");
    }
  }, [onSessionInvalid]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  /** 统一错误出口：401 交给 onSessionInvalid，其余就地提示。 */
  const reportError = useCallback(
    (error: unknown) => {
      if (isUnauthorized(error)) {
        onSessionInvalid();
        return;
      }
      notify(error instanceof Error ? error.message : "操作失败，请稍后重试", "error");
    },
    [notify, onSessionInvalid],
  );

  const closeReset = () => {
    if (busy) return;
    setResetTarget(null);
    setPassword("");
    setPasswordTouched(false);
  };

  /** 打开重置密码对话框前清掉上一次的输入与校验状态（表格与卡片共用）。 */
  const openResetPassword = (row: AdminUserRow) => {
    setPassword("");
    setPasswordTouched(false);
    setResetTarget(row);
  };

  const handleResetPassword = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = resetTarget;
    if (!target) return;
    setPasswordTouched(true);
    if (passwordIssue(password)) return;
    setBusy(true);
    try {
      await api.adminSetPassword(target.id, password);
      setResetTarget(null);
      setPassword("");
      setPasswordTouched(false);
      notify(`已重置 ${target.username} 的密码`, "success");
      await loadUsers();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleDisabled = async () => {
    const target = toggleTarget;
    if (!target) return;
    const disable = target.disabledAt === null;
    setBusy(true);
    try {
      await api.adminSetDisabled(target.id, disable);
      setToggleTarget(null);
      notify(disable ? `已禁用 ${target.username}` : `已启用 ${target.username}`, "success");
      await loadUsers();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    setBusy(true);
    try {
      await api.adminDeleteUser(target.id);
      setDeleteTarget(null);
      notify(`已删除用户 ${target.username}`, "success");
      await loadUsers();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" sx={TOUCH_SX} aria-label="重试加载用户列表" onClick={() => void loadUsers()}>
            重试
          </Button>
        }
      >
        {loadError}
      </Alert>
    );
  }

  if (users === null) {
    return (
      <Stack spacing={1.5}>
        <Skeleton variant="rounded" height={56} />
        <Skeleton variant="rounded" height={56} />
        <Skeleton variant="rounded" height={56} />
      </Stack>
    );
  }

  if (users.length === 0) {
    return <Alert severity="info">暂无用户账号。</Alert>;
  }

  const passwordMessage = passwordIssue(password);
  const showPasswordIssue = passwordTouched && Boolean(passwordMessage);
  const toggleDisable = toggleTarget ? toggleTarget.disabledAt === null : false;

  return (
    <Stack spacing={2}>
      {isDesktop ? (
        <TableContainer component={Paper} variant="outlined" sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 780 }} aria-label="用户列表">
            <TableHead>
              <TableRow>
                <TableCell variant="head" sx={HEAD_SX}>
                  用户名
                </TableCell>
                <TableCell variant="head" sx={HEAD_SX}>
                  显示名
                </TableCell>
                <TableCell variant="head" align="right" sx={HEAD_SX}>
                  行程数
                </TableCell>
                <TableCell variant="head" align="right" sx={HEAD_SX}>
                  合计里程
                </TableCell>
                <TableCell variant="head" sx={HEAD_SX}>
                  最近活跃
                </TableCell>
                <TableCell variant="head" sx={HEAD_SX}>
                  状态
                </TableCell>
                <TableCell variant="head" sx={HEAD_SX}>
                  操作
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((row) => {
                const isSelf = row.id === currentUserId;
                const disabled = row.disabledAt !== null;
                return (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {row.username}
                      </Typography>
                      {isSelf ? (
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                          当前账号
                        </Typography>
                      ) : null}
                    </TableCell>
                    <TableCell>{row.displayName}</TableCell>
                    <TableCell align="right" sx={NUM_SX}>
                      {row.tripCount}
                    </TableCell>
                    <TableCell align="right" sx={NUM_SX}>
                      {formatKm(row.totalKm)} 公里
                    </TableCell>
                    <TableCell>{formatDateTimeLabel(row.lastSeenAt)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={disabled ? "warning" : "success"}
                        label={disabled ? "已禁用" : "正常"}
                      />
                    </TableCell>
                    <TableCell>
                      <UserActions
                        row={row}
                        isSelf={isSelf}
                        onResetPassword={openResetPassword}
                        onToggleDisabled={setToggleTarget}
                        onDelete={setDeleteTarget}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Stack spacing={1.5} component="ul" aria-label="用户列表" sx={{ listStyle: "none", m: 0, p: 0 }}>
          {users.map((row) => {
            const isSelf = row.id === currentUserId;
            const disabled = row.disabledAt !== null;
            return (
              <Box component="li" key={row.id}>
                <Card variant="outlined">
                  <CardContent>
                    <Stack spacing={1.5}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                          {row.username}
                        </Typography>
                        <Chip size="small" color={disabled ? "warning" : "success"} label={disabled ? "已禁用" : "正常"} />
                      </Stack>
                      <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", flexWrap: "wrap", rowGap: 0.5 }}>
                        <Typography variant="body2">{row.displayName}</Typography>
                        {isSelf ? (
                          <Typography variant="body2" sx={{ color: "text.secondary" }}>
                            当前账号
                          </Typography>
                        ) : null}
                      </Stack>
                      <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", rowGap: 1 }}>
                        <Stack spacing={0.5}>
                          <Typography variant="caption" sx={{ color: "text.secondary" }}>
                            行程数
                          </Typography>
                          <Typography variant="body2" sx={NUM_SX}>
                            {row.tripCount}
                          </Typography>
                        </Stack>
                        <Stack spacing={0.5}>
                          <Typography variant="caption" sx={{ color: "text.secondary" }}>
                            合计里程
                          </Typography>
                          <Typography variant="body2" sx={NUM_SX}>
                            {formatKm(row.totalKm)} 公里
                          </Typography>
                        </Stack>
                        <Stack spacing={0.5}>
                          <Typography variant="caption" sx={{ color: "text.secondary" }}>
                            最近活跃
                          </Typography>
                          <Typography variant="body2" sx={NUM_SX}>
                            {formatDateTimeLabel(row.lastSeenAt)}
                          </Typography>
                        </Stack>
                      </Stack>
                      <UserActions
                        row={row}
                        isSelf={isSelf}
                        onResetPassword={openResetPassword}
                        onToggleDisabled={setToggleTarget}
                        onDelete={setDeleteTarget}
                      />
                    </Stack>
                  </CardContent>
                </Card>
              </Box>
            );
          })}
        </Stack>
      )}

      <Dialog open={Boolean(resetTarget)} onClose={closeReset} aria-labelledby="admin-pwd-title" fullWidth maxWidth="xs">
        <form onSubmit={handleResetPassword}>
          <DialogTitle id="admin-pwd-title">重置密码</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                为「{resetTarget?.username ?? ""}」设置新密码，该用户已登录的设备会全部退出。
              </Typography>
              <TextField
                label="新密码（至少 8 位）"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                error={showPasswordIssue}
                helperText={showPasswordIssue ? passwordMessage : "8–200 位"}
                slotProps={{ formHelperText: { sx: { fontSize: "0.875rem" } } }}
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={closeReset} disabled={busy} sx={TOUCH_SX} aria-label="取消重置密码">
              取消
            </Button>
            <Button type="submit" variant="contained" disabled={busy} sx={TOUCH_SX} aria-label="确认重置密码">
              {busy ? "提交中…" : "重置"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(toggleTarget)}
        onClose={() => {
          if (!busy) setToggleTarget(null);
        }}
        aria-labelledby="admin-toggle-title"
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle id="admin-toggle-title">{toggleDisable ? "禁用该账号？" : "启用该账号？"}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {toggleDisable
              ? `禁用后，「${toggleTarget?.username ?? ""}」将无法登录，已登录的设备会立即退出。`
              : `启用后，「${toggleTarget?.username ?? ""}」可以重新登录。`}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            disabled={busy}
            sx={TOUCH_SX}
            aria-label={toggleDisable ? "取消禁用账号" : "取消启用账号"}
            onClick={() => setToggleTarget(null)}
          >
            取消
          </Button>
          <Button
            variant="contained"
            color={toggleDisable ? "warning" : "success"}
            disabled={busy}
            sx={TOUCH_SX}
            aria-label={toggleDisable ? "确认禁用账号" : "确认启用账号"}
            onClick={() => void handleToggleDisabled()}
          >
            {toggleDisable ? "禁用" : "启用"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => {
          if (!busy) setDeleteTarget(null);
        }}
        aria-labelledby="admin-delete-title"
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle id="admin-delete-title">删除该用户？</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            将删除用户「{deleteTarget?.username ?? ""}」（{deleteTarget?.displayName ?? ""}），同时删除其全部行程（
            {deleteTarget?.tripCount ?? 0} 条）与登录会话（{deleteTarget?.sessionCount ?? 0} 个）。此操作不可恢复。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button disabled={busy} sx={TOUCH_SX} aria-label="取消删除用户" onClick={() => setDeleteTarget(null)}>
            取消
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={busy}
            sx={TOUCH_SX}
            aria-label="确认删除用户"
            onClick={() => void handleDelete()}
          >
            {busy ? "删除中…" : "删除"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
