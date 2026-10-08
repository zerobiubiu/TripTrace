import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import { api } from "../api";

interface PasswordDialogProps {
  open: boolean;
  username: string;
  onClose: () => void;
  onDone: (message: string) => void;
}

/** 修改密码：错误就地显示在对话框内（不再被模态遮罩压住），标题通过 aria-labelledby 关联。 */
export function PasswordDialog({ open, username, onClose, onDone }: PasswordDialogProps) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError("");
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (next !== confirm) {
      setError("两次输入的新密码不一致");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.changePassword(current, next);
      reset();
      onDone("密码已更新，其他设备的登录已退出");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "修改失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} aria-labelledby="pwd-dialog-title" fullWidth maxWidth="xs">
      <form onSubmit={handleSubmit}>
        <DialogTitle id="pwd-dialog-title">修改密码</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {/* 供浏览器密码管理器识别（隐藏但存在），消除「密码表单缺少用户名字段」的告警 */}
            <TextField
              type="text"
              label="用户名"
              value={username}
              autoComplete="username"
              tabIndex={-1}
              aria-hidden
              sx={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
            />
            <TextField
              id="pwd-current"
              label="当前密码"
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
            <TextField
              label="新密码（至少 8 位）"
              type="password"
              autoComplete="new-password"
              required
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
            <TextField
              label="确认新密码"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              error={Boolean(confirm) && next !== confirm}
              helperText={Boolean(confirm) && next !== confirm ? "两次输入不一致" : " "}
            />
            {error ? <Alert severity="error">{error}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleClose} disabled={busy}>
            取消
          </Button>
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? "保存中…" : "保存"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
