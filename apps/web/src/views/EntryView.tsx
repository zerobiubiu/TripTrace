import { useMemo, useState } from "react";
import {
  Alert,
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
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import {
  createEntryForm,
  formKmIssues,
  legSuggestion,
  totalHint,
  withLegValue,
  withNodeAdded,
  withNodeRemoved,
  withRecalculatedTotal,
  withRouteApplied,
  type EntryForm,
} from "../lib/entry";
import { chainText, formatDateLabel, formatKm, formatKmText, shiftDate, todayIso, weekdayLabel } from "../lib/format";
import { findRoute, recentRoutes, suggestNodeNames, type RouteHit, type SuggestIndex } from "../lib/suggest";
import type { Trip } from "../types";

interface EntryViewProps {
  form: EntryForm;
  updateForm: (updater: (form: EntryForm) => EntryForm) => void;
  index: SuggestIndex | null;
  trips: Trip[];
  tripsLoading: boolean;
  busy: boolean;
  onSave: () => void;
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
  onQuickRoute,
  onClear,
  onLoadTrip,
  onDeleteTrip,
}: EntryViewProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const [query, setQuery] = useState("");

  // 只排除「上一个节点」，允许回头节点（旗舰路线 家→圣润→天九→圣润→家 需要重复 圣润 与 家）
  const lastNode = form.nodes.length > 0 ? form.nodes.slice(-1) : [];
  const suggestions = useMemo(
    () => suggestNodeNames(index, query, lastNode, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, query, form.nodes.length, form.nodes[form.nodes.length - 1]],
  );
  const suggestionCounts = useMemo(() => new Map(suggestions.map((entry) => [entry.name, entry.count])), [suggestions]);
  const nodeOptions = useMemo(() => suggestions.map((entry) => entry.name), [suggestions]);
  const routeMatch = useMemo(() => findRoute(index, form.nodes), [index, form.nodes]);
  const quickRoutes = useMemo(() => recentRoutes(index, trips, 6), [index, trips]);
  const dayTrips = useMemo(() => trips.filter((trip) => trip.date === form.date), [trips, form.date]);

  const issues = formKmIssues(form);
  const hint = totalHint(form);
  const dayKm = Math.round(dayTrips.reduce((sum, trip) => sum + (trip.totalKm ?? 0), 0) * 100) / 100;
  const dayMissing = dayTrips.filter((trip) => trip.totalKm === null || trip.totalKm === undefined).length;

  const addNode = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    updateForm((current) => withNodeAdded(current, name, index));
    setQuery("");
  };

  const applyRouteMatch = () => {
    if (routeMatch) updateForm((current) => withRouteApplied(current, routeMatch, true));
  };

  const daySummary = tripsLoading
    ? "正在载入记录…"
    : dayTrips.length === 0
      ? "这一天还没有记录"
      : `这一天已录 ${dayTrips.length} 条 · 合计 ${formatKm(dayKm)} 公里${dayMissing > 0 ? ` · ${dayMissing} 条未填里程` : ""}`;

  const totalField = (props: { size?: "small" | "medium"; label: string }) => (
    <TextField
      type="text"
      label={props.label}
      size={props.size}
      value={form.total}
      error={issues.totalInvalid}
      helperText={issues.totalInvalid ? KM_HELP : undefined}
      slotProps={{ htmlInput: { inputMode: "decimal", "aria-label": "总里程" } }}
      onChange={(event) =>
        updateForm((current) => ({ ...current, total: event.target.value, totalManual: true }))
      }
    />
  );

  return (
    <Box className="tt-entry-grid" sx={{ pb: isDesktop ? 0 : "calc(140px + env(safe-area-inset-bottom))" }}>
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
              <TextField
                type="date"
                label="日期"
                value={form.date}
                onChange={(event) =>
                  updateForm((current) => ({ ...current, date: event.target.value || todayIso() }))
                }
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 176 }}
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
              路线节点（按顺序添加）
            </Typography>
            <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75, alignItems: "center", mb: 1.5 }}>
              {form.nodes.length === 0 ? (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  还没有节点，例如：家 → 圣润 → 天九
                </Typography>
              ) : (
                form.nodes.map((name, nodeIndex) => (
                  <Stack key={`${name}-${nodeIndex}`} direction="row" sx={{ alignItems: "center", gap: 0.75 }}>
                    {nodeIndex > 0 ? <Typography sx={{ color: "text.secondary" }}>→</Typography> : null}
                    <Chip
                      label={name}
                      color="primary"
                      variant="outlined"
                      onDelete={() => updateForm((current) => withNodeRemoved(current, nodeIndex))}
                      deleteIcon={
                        <CancelRoundedIcon
                          role="button"
                          tabIndex={0}
                          aria-label={`移除节点 ${name}`}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              updateForm((current) => withNodeRemoved(current, nodeIndex));
                            }
                          }}
                        />
                      }
                    />
                  </Stack>
                ))
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
                  <Box component="li" key={key} {...rest} sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
                    <span>{option}</span>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      用过 {suggestionCounts.get(option) ?? 0} 次
                    </Typography>
                  </Box>
                );
              }}
              renderInput={(params) => (
                <TextField {...params} label="节点名称" placeholder="回车添加" helperText="输入后回车添加；↑↓ 选择历史节点" />
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
                onClick={() => updateForm((current) => withNodeRemoved(current, current.nodes.length - 1))}
              >
                撤销上一个
              </Button>
              <Button color="warning" disabled={form.nodes.length === 0} onClick={onClear}>
                清空
              </Button>
            </Stack>

            {routeMatch ? (
              <Alert
                severity="info"
                sx={{ mt: 2 }}
                action={
                  <Button size="small" color="info" variant="outlined" onClick={applyRouteMatch}>
                    沿用这条
                  </Button>
                }
              >
                历史路线：{formatDateLabel(routeMatch.date)} · {formatKmText(routeMatch.totalKm)}
                {routeMatch.count > 1 ? ` · 已走 ${routeMatch.count} 次` : ""}
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        {form.legs.length > 0 ? (
          <Card>
            <CardContent>
              <Typography variant="h3" component="h3" sx={{ mb: 1 }}>
                分段里程（可不填，只填总里程也行）
              </Typography>
              <Stack spacing={1}>
                {form.legs.map((value, legIndex) => {
                  const suggestion = legSuggestion(index, form, legIndex);
                  const from = form.nodes[legIndex] ?? "";
                  const to = form.nodes[legIndex + 1] ?? "";
                  const invalid = issues.invalidLegIndexes.includes(legIndex);
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
                        borderRadius: 2,
                        bgcolor: "action.hover",
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {from} → {to}
                      </Typography>
                      <Box sx={{ flex: 1 }} />
                      {suggestion ? (
                        <Button
                          size="small"
                          variant="text"
                          onClick={() => updateForm((current) => withLegValue(current, legIndex, formatKm(suggestion.km)))}
                        >
                          {suggestion.reversed ? "反向 " : ""}
                          {formatKm(suggestion.km)} 公里
                        </Button>
                      ) : null}
                      <TextField
                        size="small"
                        value={value}
                        error={invalid}
                        helperText={invalid ? KM_HELP : undefined}
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
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}>
              {isDesktop ? totalField({ label: "总里程" }) : null}
              <Chip
                size="small"
                color={form.totalManual ? "default" : "primary"}
                label={form.totalManual ? "手动填写" : "自动合计"}
              />
              <Button onClick={() => updateForm((current) => withRecalculatedTotal({ ...current, totalManual: false }))}>
                按分段合计
              </Button>
            </Stack>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
              {hint.text}
            </Typography>
            {hint.diffKm !== null ? (
              <Alert severity="warning" sx={{ mt: 1 }}>
                与总里程差 {formatKm(hint.diffKm)} 公里
              </Alert>
            ) : null}

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
                <Button variant="contained" size="large" disabled={busy} onClick={onSave}>
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
                常用路线（点一下直接填）
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
            bottom: "calc(62px + env(safe-area-inset-bottom))",
            zIndex: (t) => t.zIndex.appBar - 1,
            borderTop: 1,
            borderColor: "divider",
          }}
        >
          <Stack direction="row" spacing={1} sx={{ p: 1.25, alignItems: "flex-start" }}>
            <Box sx={{ flex: 1 }}>{totalField({ label: "总里程", size: "small" })}</Box>
            <Button variant="contained" size="large" disabled={busy} onClick={onSave} sx={{ minHeight: 48 }}>
              {busy ? "保存中…" : form.editingId ? "保存修改" : "保存"}
            </Button>
          </Stack>
        </Paper>
      ) : null}
    </Box>
  );
}
