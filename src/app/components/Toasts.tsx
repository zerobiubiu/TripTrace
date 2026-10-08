import type { ToastMessage } from "../types";

export function Toasts({ toasts }: { toasts: ToastMessage[] }) {
  return (
    <div className="toast-host" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={toast.kind === "error" ? "toast is-error" : "toast"}>
          {toast.text}
        </div>
      ))}
    </div>
  );
}
