import { useMemo, useState } from "react";
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
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import { DateField } from "../components/DateField";
import { NodeEditor } from "../components/NodeEditor";
import { radius } from "../theme";
import {
  createEntryForm,
  formKmIssues,
  formNodeNameIssues,
  formTotalKm,
  withLegValue,
  withNodeAdded,
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

const KM_HELP = "里程需在 0 - 100000 之间";

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
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const [query, setQuery] = useState("");
  const [attempted, setAttempted] = useState(false);

  // 只排除「上一个节点」，允许回头节点（旗舰路线 家→圣润→天九→圣润→家 需要重复 圣润 与 家）
  const lastNodeName = form.nodes[form.nodes.length - 1]?.name ?? "";
  const lastNode = lastNodeName ? [lastNodeName] : [];
  const suggestions = useMemo(
    () => suggestNodeNames(index, query, lastNode, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, query, form.nodes.length, lastNodeName],
  );
  const nodeOptions = useMemo(() => suggestions.map((entry) => entry.name), [suggestions]);
  const quickRoutes = useMemo(() => recentRoutes(index, trips, 6), [index, trips]);
  const dayTrips = useMemo(() => trips.filter((trip) => trip.date === form.date), [trips, form.date]);

  const issues = formKmIssues(form);
  const nameIssues = formNodeNameIssues(form);
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
              路线节点（顺序决定路线）
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mb: 1.5 }}>
              {form.nodes.length === 0
                ? "还没有节点，例如：家 → 圣润 → 天九"
                : "拖左侧手柄调整顺序；改动顺序会立刻重算分段与总里程。"}
            </Typography>

            {form.nodes.length > 0 ? (
              <NodeEditor
                nodes={form.nodes}
                showEmptyError={attempted}
                onRename={(nodeId, name) => updateForm((current) => withNodeRenamed(current, nodeId, name))}
                onRemove={(nodeId) => updateForm((current) => withNodeRemoved(current, nodeId, index))}
                onMove={(nodeId, toIndex) => updateForm((current) => withNodeMoved(current, nodeId, toIndex, index))}
              />
            ) : null}

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
              sx={{ mt: form.nodes.length > 0 ? 2 : 0, mb: 1.5 }}
            />

            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
              <Button variant="contained" onClick={() => addNode(query)}>
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

        {form.legs.length > 0 ? (
          <Card>
            <CardContent>
              <Typography variant="h3" component="h3" sx={{ mb: 1 }}>
                分段里程（每段必填，默认带出历史值）
              </Typography>
              <Stack spacing={1}>
                {form.legs.map((value, legIndex) => {
                  const from = form.nodes[legIndex]?.name ?? "";
                  const to = form.nodes[legIndex + 1]?.name ?? "";
                  const invalid = issues.invalidLegIndexes.includes(legIndex);
                  const missing = attempted && issues.missingLegIndexes.includes(legIndex);
                  return (
                    <Stack
                      key={`${from}-${to}-${legIndex}`}
                      direction="row"
                      spacing={1}
                      sx={{
                        alignItems: "center",
                        flexWrap: "wrap",
                        rowGap: 1,
                        p: 1,
                        borderRadius: radius.control,
                        bgcolor: "action.hover",
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {from} → {to}
                      </Typography>
                      <Box sx={{ flex: 1 }} />
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
                    </Stack>
                  );
                })}
              </Stack>
            </CardContent>
          </Card>
        ) : null}

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
                  <Stack
                    key={trip.id}
                    spacing={0.5}
                    sx={{ p: 1.25, border: 1, borderColor: "divider", borderRadius: radius.control }}
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
