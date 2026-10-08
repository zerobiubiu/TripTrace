import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type ApiError } from "./api";
import { NavTabs } from "./components/NavTabs";
import { PasswordDialog } from "./components/PasswordDialog";
import { Toasts } from "./components/Toasts";
import { TopBar } from "./components/TopBar";
import { createEntryForm, formToPayload, tripToForm, type EntryForm } from "./lib/entry";
import { formatDateLabel, formatKm, todayIso } from "./lib/format";
import { buildIndex } from "./lib/suggest";
import { removeTrip, upsertTrip } from "./lib/tripList";
import type { MeResponse, TabKey, ToastMessage, Trip, TripPayload, User } from "./types";
import { AuthScreen } from "./views/AuthScreen";
import { EntryView } from "./views/EntryView";
import { ImportView } from "./views/ImportView";
import { RecordsView } from "./views/RecordsView";
import { StatsView } from "./views/StatsView";

export function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tab, setTab] = useState<TabKey>("entry");
  const [form, setForm] = useState<EntryForm>(() => createEntryForm());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const toastSeq = useRef(0);

  const index = useMemo(() => buildIndex(trips), [trips]);

  const notify = useCallback((text: string, kind: "info" | "error" = "info") => {
    const id = (toastSeq.current += 1);
    setToasts((current) => [...current, { id, text, kind }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3200);
  }, []);

  const handleError = useCallback(
    (error: unknown) => {
      const apiError = error as ApiError;
      if (apiError?.status === 401) {
        setMe((current) => (current ? { ...current, user: null } : current));
        setTrips([]);
        notify("登录已失效，请重新登录", "error");
        return;
      }
      notify(apiError?.message ?? "操作失败，请稍后重试", "error");
    },
    [notify],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await api.me();
        if (cancelled) return;
        setMe(payload);
        if (payload.user) {
          const result = await api.listTrips();
          if (!cancelled) setTrips(result.trips);
        }
      } catch (error) {
        if (cancelled) return;
        setMe({ user: null, signupCodeRequired: false, version: "dev" });
        notify(error instanceof Error ? error.message : "加载失败", "error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notify]);

  const handleAuthenticated = useCallback(
    async (user: User) => {
      setMe((current) => ({
        user,
        signupCodeRequired: current?.signupCodeRequired ?? false,
        version: current?.version ?? "dev",
      }));
      setForm(createEntryForm());
      setTab("entry");
      try {
        const result = await api.listTrips();
        setTrips(result.trips);
      } catch (error) {
        handleError(error);
      }
    },
    [handleError],
  );

  const handleSave = useCallback(async () => {
    const payload = formToPayload(form);
    if (payload.nodes.length === 0) {
      notify("请先添加至少一个节点", "error");
      return;
    }
    setBusy(true);
    try {
      const result = form.editingId
        ? await api.updateTrip(form.editingId, payload)
        : await api.createTrip(payload);
      setTrips((current) => upsertTrip(current, result.trip));
      setForm(createEntryForm(form.date));
      notify(`已保存：${formatDateLabel(result.trip.date)} · ${formatKm(result.trip.totalKm)} 公里`);
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }, [form, handleError, notify]);

  const handleDeleteTrip = useCallback(
    async (trip: Trip) => {
      if (!window.confirm(`删除 ${formatDateLabel(trip.date)} 的这条行程？`)) return;
      try {
        await api.deleteTrip(trip.id);
        setTrips((current) => removeTrip(current, trip.id));
        notify("已删除");
      } catch (error) {
        handleError(error);
      }
    },
    [handleError, notify],
  );

  const handleImport = useCallback(async (payloads: TripPayload[]) => {
    const result = await api.bulkImport(payloads);
    const refreshed = await api.listTrips();
    setTrips(refreshed.trips);
    return result;
  }, []);

  const handleExport = useCallback(() => {
    const blob = new Blob(
      [
        JSON.stringify(
          { version: me?.version ?? "dev", exportedAt: new Date().toISOString(), trips },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `triptrace-${todayIso()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [me?.version, trips]);

  const handleLogout = useCallback(async () => {
    try {
      await api.logout();
    } catch (error) {
      handleError(error);
    }
    setMe((current) => (current ? { ...current, user: null } : current));
    setTrips([]);
    setForm(createEntryForm());
    setTab("entry");
    setMenuOpen(false);
  }, [handleError]);

  if (me === null) {
    return (
      <>
        <div className="boot">正在载入途迹…</div>
        <Toasts toasts={toasts} />
      </>
    );
  }

  if (!me.user) {
    return (
      <>
        <AuthScreen
          signupCodeRequired={me.signupCodeRequired}
          version={me.version}
          onAuthenticated={handleAuthenticated}
        />
        <Toasts toasts={toasts} />
      </>
    );
  }

  return (
    <div className="shell">
      <TopBar
        user={me.user}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((value) => !value)}
        onOpenPassword={() => {
          setMenuOpen(false);
          setPasswordOpen(true);
        }}
        onExport={() => {
          setMenuOpen(false);
          handleExport();
        }}
        onLogout={handleLogout}
      />

      <div className="layout">
        <NavTabs active={tab} onChange={setTab} />
        <main className="content">
          {tab === "entry" ? (
            <EntryView
              form={form}
              updateForm={setForm}
              index={index}
              trips={trips}
              busy={busy}
              onSave={handleSave}
              onLoadTrip={(trip) => {
                setForm(tripToForm(trip));
                setTab("entry");
                notify("已载入表单，修改后点保存");
              }}
            />
          ) : null}
          {tab === "records" ? (
            <RecordsView
              trips={trips}
              onEdit={(trip) => {
                setForm(tripToForm(trip));
                setTab("entry");
                notify("已载入表单，修改后点保存");
              }}
              onDelete={handleDeleteTrip}
            />
          ) : null}
          {tab === "stats" ? <StatsView trips={trips} /> : null}
          {tab === "import" ? <ImportView onImport={handleImport} notify={notify} /> : null}
          <p className="footer">
            途迹 TripTrace v{me.version} · 数据存于你的 Cloudflare 账号（Workers + D1 + KV）
          </p>
        </main>
      </div>

      <PasswordDialog
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        onDone={(message) => {
          setPasswordOpen(false);
          notify(message);
        }}
        onError={(message) => notify(message, "error")}
      />
      <Toasts toasts={toasts} />
    </div>
  );
}
