import { useEffect, useRef, useState } from "react";
import { api } from "../api";

interface PasswordDialogProps {
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}

export function PasswordDialog({ open, onClose, onDone, onError }: PasswordDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (next !== confirm) {
      onError("两次输入的新密码不一致");
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(current, next);
      reset();
      onDone("密码已更新，其他设备的登录已退出");
    } catch (error) {
      onError(error instanceof Error ? error.message : "修改失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="sheet" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <p className="card-title">修改密码</p>
        <div className="field">
          <label className="field-label" htmlFor="pwd-current">
            当前密码
          </label>
          <input
            id="pwd-current"
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="pwd-next">
            新密码（至少 8 位）
          </label>
          <input
            id="pwd-next"
            className="input"
            type="password"
            autoComplete="new-password"
            required
            value={next}
            onChange={(event) => setNext(event.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="pwd-confirm">
            确认新密码
          </label>
          <input
            id="pwd-confirm"
            className="input"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </div>
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "保存中…" : "保存"}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
        </div>
      </form>
    </dialog>
  );
}
