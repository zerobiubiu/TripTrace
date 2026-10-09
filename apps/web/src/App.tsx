import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { api, isNetworkFailure, isUnauthorized } from "./api";
import { PasswordDialog } from "./components/PasswordDialog";
import { Toasts } from "./components/Toasts";
import { TAB_ITEMS, TopBar } from "./components/TopBar";
import { clearDraft, draftSummary, draftToForm, loadDraft, saveDraft } from "./lib/draft";
import { createEntryForm, formKmIssues, formToPayload, tripToForm, withChainApplied, type EntryForm } from "./lib/entry";
import { chainText, formatDateLabel, formatKmText, todayIso } from "./lib/format";
import { buildIndex, type RouteHit } from "./lib/suggest";
import { removeTrip, upsertTrip } from "./lib/tripList";
import { appVersion } from "./lib/version";
import type { MeResponse, TabKey, ToastMessage, Trip, TripPayload, User } from "./types";
import { AuthScreen } from "./views/AuthScreen";
import { EntryView } from "./views/EntryView";

// 记录/账号/管理按需加载：首屏只承担填报路径（PRODUCT.md 的体积约束）
const RecordsView = lazy(() => import("./views/RecordsView").then((m) => ({ default: m.RecordsView })));
const AccountView = lazy(() => import("./views/AccountView").then((m) => ({ default: m.AccountView })));
const AdminView = lazy(() => import("./views/AdminView").then((m) => ({ default: m.AdminView })));

type TripsState = "loading" | "ready" | "error";

/** 顶栏四个分组的标签 + 菜单入口（账号/管理）的视图标题，供 sr-only 标题与导航共用。 */
const VIEW_TITLES: Partial<Record<TabKey, string>> = { account: "账号", admin: "管理" };
const tabTitle = (tab: TabKey): string =>
  TAB_ITEMS.find((item) => item.key === tab)?.label ?? VIEW_TITLES[tab] ?? "";

function ViewSkeleton() {
  return (
    <Stack spacing={1.5}>
      <Skeleton variant="rounded" height={96} />
      <Skeleton variant="rounded" height={160} />
      <Skeleton variant="rounded" height={96} />
    </Stack>
  );
}

export function App() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tripsState, setTripsState] = useState<TripsState>("ready");
  const [tab, setTab] = useState<TabKey>("entry");
  const [form, setForm] = useState<EntryForm>(() => createEntryForm());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Trip | null>(null);
  const toastSeq = useRef(0);

  const index = useMemo(() => buildIndex(trips), [trips]);
  const userId = me?.user?.id ?? null;

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (text: string, kind: ToastMessage["kind"] = "info", action?: { label: string; run: () => void }) => {
      const id = (toastSeq.current += 1);
      setToasts((current) => [...current, { id, text, kind, action }]);
    },
    [],
  );

  const loadTrips = useCallback(async () => {
    setTripsState("loading");
    try {
      const result = await api.listTrips();
      setTrips(result.trips);
      setTripsState("ready");
    } catch (error) {
      setTripsState("error");
      if (isUnauthorized(error)) {
        setMe((current) => (current ? { ...current, user: null } : current));
        notify("登录已失效，请重新登录；刚才的草稿已保留", "error");
      } else if (isNetworkFailure(error)) {
        notify("网络不可用，记录暂时读不到", "error", { label: "重试", run: () => void loadTrips() });
      } else {
        notify(error instanceof Error ? error.message : "记录加载失败", "error");
      }
    }
  }, [notify]);

  // 草稿恢复：新登录与「刷新/被系统回收后重开」两条路径都要恢复，否则空表单会立刻把草稿清掉
  const restoreDraft = useCallback(
    (id: string) => {
      const draft = loadDraft(id);
      if (!draft) return;
      setForm(draftToForm(draft));
      notify(`已恢复上次未保存的草稿（${draftSummary(draft)}）`, "info", {
        label: "丢弃",
        run: () => {
          clearDraft(id);
          setForm(createEntryForm());
        },
      });
    },
    [notify],
  );

  // 启动：只区分「网络失败」与「已登出」，绝不把网络故障渲染成登录页
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const payload = await api.me();
        if (cancelled) return;
        setMe(payload);
        if (payload.user) {
          restoreDraft(payload.user.id);
          await loadTrips();
        }
      } catch (error) {
        if (cancelled) return;
        // 启动阶段无法确认会话时，一律给可重试的错误屏：绝不把「连不上」渲染成「你被登出了」
        setBootError(
          isNetworkFailure(error) ? "网络不可用，请检查连接后重试" : "暂时连不上服务器，请稍后重试",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadTrips, notify, restoreDraft]);

  // 草稿：表单非空即落盘；清空后自动删除
  useEffect(() => {
    if (userId) saveDraft(userId, form);
  }, [userId, form]);

  const handleError = useCallback(
    (error: unknown) => {
      if (isUnauthorized(error)) {
        setMe((current) => (current ? { ...current, user: null } : current));
        setTrips([]);
        notify("登录已失效，请重新登录；刚才的草稿已保留", "error");
        return;
      }
      notify(error instanceof Error ? error.message : "操作失败，请稍后重试", "error");
    },
    [notify],
  );

  const handleAuthenticated = useCallback(
    async (user: User) => {
      setMe((current) => ({
        user,
        signupCodeRequired: current?.signupCodeRequired ?? false,
        version: current?.version ?? appVersion,
        isAdmin: false,
      }));
      // 登录/注册响应不含管理员标记，用 /api/me 补齐（失败只影响「管理」入口是否出现，不阻塞登录）
      void api
        .me()
        .then((payload) => setMe(payload))
        .catch(() => undefined);
      setTab("entry");
      restoreDraft(user.id);
      await loadTrips();
    },
    [loadTrips, notify, restoreDraft],
  );

  const handleSave = useCallback(async () => {
    const payload = formToPayload(form);
    if (payload.nodes.length === 0) {
      notify("请先添加至少一个节点", "error");
      return;
    }
    const issues = formKmIssues(form);
    if (issues.invalidLegIndexes.length > 0) {
      notify("有里程填写不规范（需在 0 - 100000 之间），改好后再保存", "error");
      return;
    }
    if (issues.missingLegIndexes.length > 0) {
      notify(`还有 ${issues.missingLegIndexes.length} 段里程没填，补齐后才能保存`, "error");
      return;
    }
    setBusy(true);
    try {
      const result = form.editingId
        ? await api.updateTrip(form.editingId, payload)
        : await api.createTrip(payload);
      setTrips((current) => upsertTrip(current, result.trip));
      if (userId) clearDraft(userId);
      setForm(createEntryForm(form.date));
      notify(`已保存：${formatDateLabel(result.trip.date)} · ${formatKmText(result.trip.totalKm)}`);
    } catch (error) {
      handleError(error);
    } finally {
      setBusy(false);
    }
  }, [form, handleError, notify, userId]);

  // 可恢复的破坏性操作：清空 / 一键覆盖都留一份快照 + 撤销入口
  const handleClear = useCallback(() => {
    const snapshot = form;
    setForm(createEntryForm(form.date));
    notify("已清空节点链", "info", { label: "撤销", run: () => setForm(snapshot) });
  }, [form, notify]);

  const handleQuickRoute = useCallback(
    (route: RouteHit) => {
      const snapshot = form;
      setForm((current) => withChainApplied(current, route.nodes, index));
      notify(`已填入「${chainText(route.nodes)}」`, "info", { label: "撤销", run: () => setForm(snapshot) });
    },
    [form, index, notify],
  );

  const confirmDelete = useCallback(async () => {
    const trip = pendingDelete;
    setPendingDelete(null);
    if (!trip) return;
    try {
      await api.deleteTrip(trip.id);
      setTrips((current) => removeTrip(current, trip.id));
      notify("已删除");
    } catch (error) {
      handleError(error);
    }
  }, [handleError, notify, pendingDelete]);

  const handleImport = useCallback(async (payloads: TripPayload[]) => {
    const result = await api.bulkImport(payloads);
    const refreshed = await api.listTrips();
    setTrips(refreshed.trips);
    return result;
  }, []);

  const handleExport = useCallback(() => {
    const blob = new Blob(
      [JSON.stringify({ version: appVersion, exportedAt: new Date().toISOString(), trips }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `triptrace-${todayIso()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [trips]);

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
  }, [handleError]);

  const existingKeys = useMemo(
    () => new Set(trips.map((trip) => `${trip.date}|${trip.nodes.join("\u0001")}`)),
    [trips],
  );

  if (bootError) {
    return (
      <Stack spacing={2} sx={{ alignItems: "center", justifyContent: "center", minHeight: "100vh", p: 3 }}>
        <Alert severity="error" sx={{ maxWidth: 420 }}>
          {bootError}
        </Alert>
        <Button variant="contained" onClick={() => window.location.reload()}>
          重试
        </Button>
      </Stack>
    );
  }

  if (me === null) {
    return (
      <Stack spacing={1.5} sx={{ maxWidth: 480, mx: "auto", p: 2, pt: 8 }}>
        <Skeleton variant="rounded" height={48} />
        <Skeleton variant="rounded" height={220} />
      </Stack>
    );
  }

  if (!me.user) {
    return (
      <>
        <AuthScreen
          signupCodeRequired={me.signupCodeRequired}
          version={appVersion}
          onAuthenticated={handleAuthenticated}
        />
        <Toasts toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  return (
    <Box className="tt-shell">
      <TopBar
        user={me.user}
        active={tab}
        isAdmin={me.isAdmin}
        onChangeTab={setTab}
        onOpenAccount={() => setTab("account")}
        onOpenAdmin={() => setTab("admin")}
        onOpenPassword={() => setPasswordOpen(true)}
        onExport={handleExport}
        onLogout={handleLogout}
      />

      <Box
        sx={{
          flex: 1,
          width: "100%",
          maxWidth: 1240,
          mx: "auto",
          px: 2,
          pt: 2,
        }}
      >
        <Box component="main" className="tt-main" sx={{ display: "flex", flexDirection: "column" }}>
          <Typography variant="h2" component="h2" className="tt-sr-only">
            {tabTitle(tab)}
          </Typography>

          <Box sx={{ flex: 1 }}>
            {tab === "entry" ? (
              <EntryView
                form={form}
                updateForm={setForm}
                index={index}
                trips={trips}
                tripsLoading={tripsState === "loading"}
                busy={busy}
                onSave={handleSave}
                onInvalid={(message) => notify(message, "error")}
                onQuickRoute={handleQuickRoute}
                onClear={handleClear}
                onLoadTrip={(trip) => {
                  setForm(tripToForm(trip, index));
                  notify("已载入表单，修改后点保存");
                }}
                onDeleteTrip={setPendingDelete}
                onImport={handleImport}
                existing={existingKeys}
                notify={notify}
              />
            ) : null}

            {tab === "records" ? (
              <Suspense fallback={<ViewSkeleton />}>
                {tripsState === "loading" ? (
                  <ViewSkeleton />
                ) : tripsState === "error" ? (
                  <Alert
                    severity="error"
                    action={
                      <Button color="inherit" size="small" onClick={() => void loadTrips()}>
                        重试
                      </Button>
                    }
                  >
                    记录暂时读不到，请检查网络后重试。
                  </Alert>
                ) : (
                  <RecordsView
                    trips={trips}
                    onEdit={(trip) => {
                      setForm(tripToForm(trip, index));
                      setTab("entry");
                      notify("已载入表单，修改后点保存");
                    }}
                    onDelete={setPendingDelete}
                  />
                )}
              </Suspense>
            ) : null}

            {tab === "account" ? (
              <Suspense fallback={<ViewSkeleton />}>
                <AccountView
                  user={me.user}
                  notify={notify}
                  onOpenPassword={() => setPasswordOpen(true)}
                  onUserChanged={(user) => setMe((current) => (current ? { ...current, user } : current))}
                  onSessionInvalid={() => setMe((current) => (current ? { ...current, user: null } : current))}
                />
              </Suspense>
            ) : null}

            {tab === "admin" ? (
              <Suspense fallback={<ViewSkeleton />}>
                <AdminView
                  currentUserId={me.user.id}
                  notify={notify}
                  onSessionInvalid={() => setMe((current) => (current ? { ...current, user: null } : current))}
                />
              </Suspense>
            ) : null}
          </Box>

          <Typography variant="caption" className="tt-footer" sx={{ color: "text.secondary", pt: 3 }}>
            途迹 TripTrace v{appVersion}
          </Typography>
        </Box>
      </Box>

      <PasswordDialog
        open={passwordOpen}
        username={me.user.username}
        onClose={() => setPasswordOpen(false)}
        onDone={(message) => {
          setPasswordOpen(false);
          notify(message);
        }}
      />

      <Dialog open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} aria-labelledby="delete-dialog-title">
        <DialogTitle id="delete-dialog-title">删除这条行程？</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {pendingDelete
              ? `${formatDateLabel(pendingDelete.date)} · ${chainText(pendingDelete.nodes)} · ${formatKmText(pendingDelete.totalKm)}`
              : ""}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPendingDelete(null)}>取消</Button>
          <Button color="error" variant="contained" onClick={() => void confirmDelete()}>
            删除
          </Button>
        </DialogActions>
      </Dialog>

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </Box>
  );
}
