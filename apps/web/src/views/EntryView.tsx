import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import { DateField } from "../components/DateField";
import { RouteEditor } from "../components/RouteEditor";
import { TripCard } from "../components/TripCard";
import {
  createEntryForm,
  formKmIssues,
  formNodeNameIssues,
  formTotalKm,
  withLegValue,
  withNodeAppended,
  withNodeMoved,
  withNodeRenamed,
  withNodeRemoved,
  type EntryForm,
} from "../lib/entry";
import { chainText, formatDateLabel, formatKm, formatKmText, shiftDate, todayIso, weekdayLabel } from "../lib/format";
import { recentRoutes, suggestNodeNames, type RouteHit, type SuggestIndex } from "../lib/suggest";
import type { Trip } from "../types";

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
  onClear: () => void;
  onLoadTrip: (trip: Trip) => void;
  onDeleteTrip: (trip: Trip) => void;
}

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
  onClear,
  onLoadTrip,
  onDeleteTrip,
}: EntryViewProps) {
  const theme = useTheme();
  // 桌面形态＝≥1024（theme.breakpoints.values.lg）；小于它一律算手机/平板形态（768–1023 与手机同形，只放宽宽度）
  const isDesktop = useMediaQuery(theme.breakpoints.up("lg"));
  const [attempted, setAttempted] = useState(false);

  const nodeOptionsFor = (position: number, query: string) => {
    // 只排除「上一个节点」，允许回头节点（旗舰路线 家→圣润→天九→圣润→家 需要重复 圣润 与 家）；
    // 候选顺序 = 模糊匹配相关性 + 使用频率（口径见 suggest.ts），**与路线实际顺序无关**
    const previous = position > 0 ? [form.nodes[position - 1]?.name ?? ""] : [];
    return suggestNodeNames(index, query, previous, 8).map((entry) => entry.name);
  };

  const quickRoutes = useMemo(() => recentRoutes(index, trips, 6), [index, trips]);
  const dayTrips = useMemo(() => trips.filter((trip) => trip.date === form.date), [trips, form.date]);

  const issues = formKmIssues(form);
  const nameIssues = formNodeNameIssues(form);
  const totalKm = formTotalKm(form);
  const dayKm = Math.round(dayTrips.reduce((sum, trip) => sum + (trip.totalKm ?? 0), 0) * 100) / 100;
  const dayMissing = dayTrips.filter((trip) => trip.totalKm === null || trip.totalKm === undefined).length;

  const handleSaveClick = () => {
    setAttempted(true);
    if (form.nodes.length === 0) {
      onInvalid("请先添加至少一个节点");
      return;
    }
    if (nameIssues.length > 0) {
      onInvalid(`第 ${nameIssues.map((index) => index + 1).join("、")} 站还没填节点名`);
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
    <Box className="tt-entry-grid" sx={{ pb: isDesktop ? 0 : "calc(var(--tt-savebar-h) + 8px + env(safe-area-inset-bottom))" }}>
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
              <DateField
                label="日期"
                value={form.date}
                onChange={(iso) => updateForm((current) => ({ ...current, date: iso }))}
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
            <Typography variant="h3" component="h3" sx={{ mb: 0.5 }}>
              路线（顺序与分段里程）
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mb: 1.5 }}>
              {form.nodes.length === 0
                ? "还没有节点，例如：家 → 圣润 → 天九。点「添加节点」开始，节点名可以先从常用里选。"
                : "点节点名可从常用节点里选（不会弹键盘）；右侧键盘图标才进入手动输入。拖左侧手柄调整顺序。"}
            </Typography>

            {form.nodes.length > 0 ? (
              <RouteEditor
                nodes={form.nodes}
                legs={form.legs}
                showEmptyError={attempted}
                legIssues={issues}
                optionsFor={nodeOptionsFor}
                onRename={(nodeId, name) => updateForm((current) => withNodeRenamed(current, nodeId, name, index))}
                onRemove={(nodeId) => updateForm((current) => withNodeRemoved(current, nodeId, index))}
                onMove={(nodeId, toIndex) => updateForm((current) => withNodeMoved(current, nodeId, toIndex, index))}
                onLegChange={(legIndex, value) => updateForm((current) => withLegValue(current, legIndex, value))}
              />
            ) : null}

            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1, mt: form.nodes.length > 0 ? 2 : 0 }}>
              <Button variant="contained" onClick={() => updateForm((current) => withNodeAppended(current, index))}>
                添加节点
              </Button>
              <Button
                startIcon={<UndoRoundedIcon />}
                disabled={form.nodes.length === 0}
                onClick={() =>
                  updateForm((current) => {
                    const last = current.nodes[current.nodes.length - 1];
                    return last ? withNodeRemoved(current, last.id, index) : current;
                  })
                }
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
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    variant="compact"
                    onEdit={onLoadTrip}
                    onDelete={onDeleteTrip}
                  />
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
          {/* 横屏手机只有 320–430px 高：保存条压到约 56px，把高度让给路线编辑区 */}
          <Stack
            direction="row"
            spacing={1}
            sx={{
              p: 1.25,
              alignItems: "center",
              "@media (max-height: 480px)": { py: 0.5 },
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="caption"
                sx={{ color: "text.secondary", "@media (max-height: 480px)": { display: "none" } }}
              >
                总里程
              </Typography>
              <Typography
                variant="h5"
                component="p"
                sx={{
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1.2,
                  "@media (max-height: 480px)": { fontSize: "1rem", lineHeight: 1.5 },
                }}
              >
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
