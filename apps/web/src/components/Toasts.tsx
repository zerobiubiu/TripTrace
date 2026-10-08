import { Alert, Button, Snackbar } from "@mui/material";
import type { ToastMessage } from "../types";

interface ToastsProps {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}

/**
 * 轻提示：一次只显示最新一条；错误用 Alert（role=alert，读屏可播报）。
 * 可带一个动作（如「撤销」），用于清空/覆盖这类可恢复的破坏性操作。
 */
export function Toasts({ toasts, onDismiss }: ToastsProps) {
  const current = toasts.length > 0 ? toasts[toasts.length - 1] : undefined;
  if (!current) return null;

  const isError = current.kind === "error";
  return (
    <Snackbar
      key={current.id}
      open
      autoHideDuration={isError || current.action ? 6000 : 3200}
      onClose={() => onDismiss(current.id)}
      sx={{ bottom: { xs: "calc(152px + env(safe-area-inset-bottom))", md: 24 } }}
    >
      <Alert
        severity={isError ? "error" : "info"}
        variant="filled"
        onClose={() => onDismiss(current.id)}
        action={
          current.action ? (
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                current.action?.run();
                onDismiss(current.id);
              }}
            >
              {current.action.label}
            </Button>
          ) : undefined
        }
      >
        {current.text}
      </Alert>
    </Snackbar>
  );
}
