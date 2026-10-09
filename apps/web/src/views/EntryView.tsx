import { useMemo, useRef, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import DragIndicatorRoundedIcon from "@mui/icons-material/DragIndicatorRounded";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import type { BulkImportResponse } from "@triptrace/contracts";
import { ImportSection } from "./ImportView";
import {
  createEntryForm,
  formKmIssues,
  formTotalKm,
  withLegValue,
  withNodeAdded,
  withNodeRemoved,
  withNodesReordered,
  type EntryForm,
} from "../lib/entry";
import { chainText, formatDateLabel, formatKm, formatKmText, shiftDate, todayIso, weekdayLabel } from "../lib/format";
import { recentRoutes, suggestNodeNames, type RouteHit, type SuggestIndex } from "../lib/suggest";
import type { Trip, TripPayload } from "../types";

interface EntryViewProps {
  form: EntryForm;
  updateForm: (updater: (form: EntryForm) => EntryForm) => void;
  index: SuggestIndex | null;
  trips: Trip[];
  tripsLoading: boolean;
  busy: boolean;
  onSave: () => void;
  onInvalid: (message: string) => void;
  onQuickRoute: (route: RouteHit) => void;
  /** 导入并入填报：页内展开的导入区用同一套回调 */
  onImport: (payloads: TripPayload[]) => Promise<BulkImportResponse>;
  existing: Set<string>;
  notify: (message: string, severity?: "success" | "info" | "warning" | "error", action?: { label: string; run: () => void }) => void;
  onClear: () => void;
  onLoadTrip: (trip: Trip) => void;
  onDeleteTrip: (trip: Trip) => void;
}

const KM_HELP = "里程需在 0 - 100000 之间";

/** 日期弹层内的文字下限：MUI X 默认 overline 13.7px、星期标签 12px，都低于 14px 地板。 */
const PICKER_TEXT_SX = {
  "& .MuiTypography-overline": { fontSize: "0.875rem" },
  "& .MuiDayCalendar-weekDayLabel": { fontSize: "0.875rem" },
} as const;

export function EntryView({
  form,
  updateForm,
  index,
  trips,
  tripsLoading,
  busy,
  onSave,
  onInvalid,
  onQuickRoute,
  onImport,
  existing,
  notify,
  onClear,
  onLoadTrip,
  onDeleteTrip,
}: EntryViewProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const [query, setQuery] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  // —— 拖动排序：pointer 拖动 + 键盘 ↑↓，不引依赖 —— //
  // 拖动以「目的节点」为单位：第 i 段那一行代表节点 i+1（第一个节点没有自己的行，故不可拖动/删除）。
  const [dragNodeIndex, setDragNodeIndex] = useState<number | null>(null);
  const legListRef = useRef<HTMLDivElement | null>(null);

  const moveNode = (from: number, to: number) => {
    if (from === to) return;
    updateForm((current) => withNodesReordered(current, from, to, index));
  };

  const beginDrag = (event: React.PointerEvent<HTMLElement>, legIndex: number) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();

    const startNode = legIndex + 1;
    let currentFrom = startNode;
    setDragNodeIndex(startNode);

    const nodeAt = (clientY: number): number => {
      const rows = Array.from(legListRef.current?.querySelectorAll<HTMLElement>("[data-leg-index]") ?? []);
      for (const row of rows) {
        const rect = row.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
          return Math.min(form.nodes.length - 1, Number(row.dataset.legIndex ?? 0) + 1);
        }
      }
      return currentFrom;
    };

    const onMove = (moveEvent: PointerEvent) => {
      const target = Math.max(1, Math.min(form.nodes.length - 1, nodeAt(moveEvent.clientY)));
      if (target === currentFrom) return;
      moveNode(currentFrom, target);
      currentFrom = target;
    };
    const onEnd = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      setDragNodeIndex(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
  };

  const moveWithKeyboard = (event: React.KeyboardEvent<HTMLElement>, legIndex: number) => {
    const nodeFrom = legIndex + 1;
    if (event.key === "ArrowUp" && nodeFrom > 1) {
      event.preventDefault();
      moveNode(nodeFrom, nodeFrom - 1);
    } else if (event.key === "ArrowDown" && nodeFrom < form.nodes.length - 1) {
      event.preventDefault();
      moveNode(nodeFrom, nodeFrom + 1);
    }
  };

  // 只排除「上一个节点」，允许回头节点（旗舰路线 家→圣润→天九→圣润→家 需要重复 圣润 与 家）
  const lastNode = form.nodes.length > 0 ? form.nodes.slice(-1) : [];
  const suggestions = useMemo(
    () => suggestNodeNames(index, query, lastNode, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, query, form.nodes.length, form.nodes[form.nodes.length - 1]],
  );
  const nodeOptions = useMemo(() => suggestions.map((entry) => entry.name), [suggestions]);
  const quickRoutes = useMemo(() => recentRoutes(index, trips, 6), [index, trips]);
  const dayTrips = useMemo(() => trips.filter((trip) => trip.date === form.date), [trips, form.date]);

  const issues = formKmIssues(form);
  const totalKm = formTotalKm(form);
  const dayKm = Math.round(dayTrips.reduce((sum, trip) => sum + (trip.totalKm ?? 0), 0) * 100) / 100;
  const dayMissing = dayTrips.filter((trip) => trip.totalKm === null || trip.totalKm === undefined).length;

  const addNode = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    updateForm((current) => withNodeAdded(current, name, index));
    setQuery("");
  };

  const handleSaveClick = () => {
    setAttempted(true);
    if (form.nodes.length === 0) {
      onInvalid("请先添加至少一个节点");
      return;
    }
    if (issues.invalidLegIndexes.length > 0) {
      onInvalid("有里程填写不规范（0 - 100000），改好后再保存");
      return;
    }
    if (issues.missingLegIndexes.length > 0) {
      onInvalid(`还有 ${issues.missingLegIndexes.length} 段里程没填，补齐后才能保存`);
      return;
    }
    onSave();
  };

  const daySummary = tripsLoading
    ? "正在载入记录…"
    : dayTrips.length === 0
      ? "这一天还没有记录"
      : `这一天已录 ${dayTrips.length} 条 · 合计 ${formatKm(dayKm)} 公里${dayMissing > 0 ? ` · ${dayMissing} 条未填里程` : ""}`;

  return (
    <Box className="tt-entry-grid" sx={{ pb: isDesktop ? 0 : "calc(88px + env(safe-area-inset-bottom))" }}>
      <Stack spacing={1.5}>
        <Card>
          <CardContent>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
              <IconButton
                aria-label="前一天"
                onClick={() => updateForm((current) => ({ ...current, date: shiftDate(current.date, -1) }))}
              >
                <ChevronLeftRoundedIcon />
              </IconButton>
              <DatePicker
                label="日期"
                value={dayjs(form.date)}
                format="YYYY/MM/DD"
                open={dateOpen}
                onOpen={() => setDateOpen(true)}
                onClose={() => setDateOpen(false)}
                onChange={(value) =>
                  updateForm((current) => ({
                    ...current,
                    date: value && value.isValid() ? value.format("YYYY-MM-DD") : current.date,
                  }))
                }
                slotProps={{
                  textField: {
                    sx: {
                      // 只读的日期显示：宽度贴合日期本身（132px），值因此在框内居中（实测左右各 14px）
                      // MUI X v9 的值渲染在 .MuiPickersSectionList-root 里（不是 <input>），
                      // 所以字号/数字样式要挂在这个容器上；装饰区（日历图标）直接隐藏
                      width: 132,
                      "& .MuiInputAdornment-root": { display: "none" },
                      "& .MuiPickersSectionList-root": { fontVariantNumeric: "tabular-nums" },
                    },
                    // 点整块就弹选择器；输入框只读（日期只选不敲），键盘 Enter/空格/↓ 同样打开
                    onClick: () => setDateOpen(true),
                    onKeyDown: (event) => {
                      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
                        event.preventDefault();
                        setDateOpen(true);
                      }
                    },
                    slotProps: {
                      htmlInput: { readOnly: true, "aria-haspopup": "dialog" },
                    },
                  },
                  field: { clearable: false },
                  // 弹层内 MUI X 的默认字号（overline 13.7px、星期标签 12px）抬到 14px 下限；
                  // 窄屏走 dialog 变体、宽屏走 popper 变体，两处都要挂
                  popper: { sx: PICKER_TEXT_SX },
                  dialog: { sx: PICKER_TEXT_SX },
                }}
              />
              <IconButton
                aria-label="后一天"
                onClick={() => updateForm((current) => ({ ...current, date: shiftDate(current.date, 1) }))}
              >
                <ChevronRightRoundedIcon />
              </IconButton>
              <Button
                variant="outlined"
                onClick={() => updateForm((current) => ({ ...current, date: todayIso() }))}
              >
                今天
              </Button>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {weekdayLabel(form.date)}
              </Typography>
            </Stack>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
              {daySummary}
            </Typography>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h3" component="h3" sx={{ mb: 1 }}>
              路线（每段一行，可拖动调整顺序）
            </Typography>
            <Stack ref={legListRef} spacing={1} sx={{ mb: 1.5 }}>
              {form.nodes.length === 0 ? (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  还没有节点，例如：家 → 圣润 → 天九
                </Typography>
              ) : (
                form.legs.map((value, legIndex) => {
                  const from = form.nodes[legIndex] ?? "";
                  const to = form.nodes[legIndex + 1] ?? "";
                  const invalid = issues.invalidLegIndexes.includes(legIndex);
                  const missing = attempted && issues.missingLegIndexes.includes(legIndex);
                  const dragging = dragNodeIndex === legIndex + 1;
                  return (
                    <Stack
                      key={`${from}-${to}-${legIndex}`}
                      data-leg-index={legIndex}
                      direction="row"
                      spacing={1}
                      sx={{
                        alignItems: "center",
                        p: 1,
                        borderRadius: 2,
                        bgcolor: dragging ? "action.selected" : "action.hover",
                        borderLeft: 3,
                        borderColor: "primary.main",
                      }}
                    >
                      <IconButton
                        size="small"
                        aria-label={`拖动排序：第 ${legIndex + 1} 段（节点 ${to}），共 ${form.legs.length} 段；方向键可换位`}
                        onPointerDown={(event) => beginDrag(event, legIndex)}
                        onKeyDown={(event) => moveWithKeyboard(event, legIndex)}
                        sx={{ width: 44, height: 44, touchAction: "none", cursor: "grab" }}
                      >
                        <DragIndicatorRoundedIcon fontSize="small" />
                      </IconButton>
                      <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                        {from} → {to}
                      </Typography>
                      <Box sx={{ flex: 1, minWidth: 8 }} />
                      <TextField
                        size="small"
                        value={value}
                        error={invalid || missing}
                        helperText={invalid ? KM_HELP : missing ? "必填" : undefined}
                        slotProps={{
                          htmlInput: { inputMode: "decimal", "aria-label": `${from} 到 ${to} 的里程` },
                        }}
                        onChange={(event) =>
                          updateForm((current) => withLegValue(current, legIndex, event.target.value))
                        }
                        sx={{ width: 124 }}
                      />
                      <IconButton
                        size="small"
                        aria-label={`移除节点 ${to}`}
                        onClick={() => updateForm((current) => withNodeRemoved(current, legIndex + 1, index))}
                        sx={{ width: 44, height: 44 }}
                      >
                        <CancelRoundedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  );
                })
              )}
            </Stack>

            <Autocomplete
              freeSolo
              autoHighlight
              options={nodeOptions}
              filterOptions={(options) => options}
              inputValue={query}
              value={null}
              onInputChange={(_event, value) => setQuery(value)}
              onChange={(_event, value) => {
                if (typeof value === "string") addNode(value);
              }}
              renderOption={(props, option) => {
                const { key, ...rest } = props as typeof props & { key: React.Key };
                return (
                  <Box component="li" key={key} {...rest}>
                    <span>{option}</span>
                  </Box>
                );
              }}
              renderInput={(params) => (
                <TextField {...params} label="节点名称" placeholder="回车添加" />
              )}
              sx={{ mb: 1.5 }}
            />

            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
              <Button variant="contained" onClick={() => addNode(query)}>
                添加节点
              </Button>
              <Button
                startIcon={<UndoRoundedIcon />}
                disabled={form.nodes.length === 0}
                onClick={() => updateForm((current) => withNodeRemoved(current, current.nodes.length - 1, index))}
              >
                撤销上一个
              </Button>
              <Button color="warning" disabled={form.nodes.length === 0} onClick={onClear}>
                清空
              </Button>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h3" component="h3" sx={{ mb: 1 }}>
              总里程
            </Typography>
            <Typography variant="h5" component="p" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {totalKm === null ? "补齐分段后自动合计" : `${formatKm(totalKm)} 公里`}
            </Typography>

            <TextField
              label="备注（可选）"
              value={form.note}
              onChange={(event) => updateForm((current) => ({ ...current, note: event.target.value }))}
              slotProps={{ htmlInput: { maxLength: 300 } }}
              fullWidth
              sx={{ mt: 1.5 }}
            />

            {isDesktop ? (
              <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", rowGap: 1 }}>
                <Button variant="contained" size="large" disabled={busy} onClick={handleSaveClick}>
                  {busy ? "保存中…" : form.editingId ? "保存修改" : "保存行程"}
                </Button>
                {form.editingId ? (
                  <Button size="large" onClick={() => updateForm((current) => createEntryForm(current.date))}>
                    取消编辑
                  </Button>
                ) : null}
              </Stack>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Typography variant="h3" component="h3">
                导入历史文本
              </Typography>
              <Button
                size="small"
                variant="outlined"
                sx={{ minHeight: 44 }}
                aria-expanded={importOpen}
                aria-controls="entry-import-section"
                onClick={() => setImportOpen((current) => !current)}
              >
                {importOpen ? "收起" : "展开"}
              </Button>
            </Stack>
            {importOpen ? (
              <Box id="entry-import-section" sx={{ mt: 1.5 }}>
                <ImportSection onImport={onImport} notify={notify} existing={existing} />
              </Box>
            ) : null}
          </CardContent>
        </Card>
      </Stack>

      <Stack spacing={1.5}>
        {tripsLoading ? (
          <Card>
            <CardContent>
              <Typography variant="h3" component="h3" sx={{ mb: 1 }}>
                常用路线
              </Typography>
              <Stack spacing={1}>
                <Skeleton variant="rounded" height={34} />
                <Skeleton variant="rounded" height={34} />
              </Stack>
            </CardContent>
          </Card>
        ) : quickRoutes.length > 0 ? (
          <Card>
            <CardContent>
              <Typography variant="h3" component="h3" sx={{ mb: 1 }}>
                常用路线
              </Typography>
              <Stack spacing={1}>
                {quickRoutes.map((route) => (
                  <Button
                    key={`${route.nodes.join("-")}-${route.date}`}
                    variant="outlined"
                    onClick={() => onQuickRoute(route)}
                    sx={{ justifyContent: "space-between", textAlign: "left", gap: 2, py: 1 }}
                  >
                    <span>{chainText(route.nodes)}</span>
                    <span>{formatKmText(route.totalKm)}</span>
                  </Button>
                ))}
              </Stack>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent>
            <Typography variant="h3" component="h3" sx={{ mb: 1 }}>
              {formatDateLabel(form.date)} 的记录
            </Typography>
            {tripsLoading ? (
              <Skeleton variant="rounded" height={64} />
            ) : dayTrips.length === 0 ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                还没有记录
              </Typography>
            ) : (
              <Stack spacing={1}>
                {dayTrips.map((trip) => (
                  <Stack
                    key={trip.id}
                    spacing={0.5}
                    sx={{ p: 1.25, border: 1, borderColor: "divider", borderRadius: 2 }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {chainText(trip.nodes)}
                    </Typography>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
                      <Chip size="small" color={trip.totalKm === null ? "warning" : "primary"} label={formatKmText(trip.totalKm)} />
                      {trip.source === "import" ? <Chip size="small" label="导入" /> : null}
                      <Box sx={{ flex: 1 }} />
                      <Button size="small" onClick={() => onLoadTrip(trip)}>
                        编辑
                      </Button>
                      <Button size="small" color="error" onClick={() => onDeleteTrip(trip)}>
                        删除
                      </Button>
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Stack>

      {/* 移动端底部固定操作条：总里程 + 保存常驻拇指区（链再长也不会把主操作推出屏幕） */}
      {!isDesktop ? (
        <Paper
          square
          elevation={8}
          sx={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            pb: "env(safe-area-inset-bottom)",
            zIndex: (t) => t.zIndex.appBar - 1,
            borderTop: 1,
            borderColor: "divider",
          }}
        >
          <Stack direction="row" spacing={1} sx={{ p: 1.25, alignItems: "center" }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                总里程
              </Typography>
              <Typography variant="h5" component="p" sx={{ fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>
                {totalKm === null ? "—" : `${formatKm(totalKm)} 公里`}
              </Typography>
            </Box>
            <Button variant="contained" size="large" disabled={busy} onClick={handleSaveClick} sx={{ minHeight: 48 }}>
              {busy ? "保存中…" : form.editingId ? "保存修改" : "保存"}
            </Button>
          </Stack>
        </Paper>
      ) : null}
    </Box>
  );
}
