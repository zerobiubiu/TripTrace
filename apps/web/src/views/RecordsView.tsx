import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import { PillGroup } from "../components/PillGroup";
import { RangeControl } from "../components/RangeControl";
import { chainText, formatDateLabel, formatKm, formatMonthLabel, weekdayLabel } from "../lib/format";
import {
  filterTrips,
  hasConditions,
  rangeLabel,
  sortTrips,
  summarize,
  type RecordSort,
  type TripFilter,
} from "../lib/query";
import type { Trip } from "../types";

/** 首屏只渲染最新的 60 条，避免上百条行程一次全部挂载。 */
const PAGE_SIZE = 60;

const SORT_OPTIONS: ReadonlyArray<{ value: RecordSort; label: string }> = [
  { value: "recent", label: "最新在前" },
  { value: "km", label: "里程从高到低" },
];

interface RecordsViewProps {
  trips: Trip[];
  filter: TripFilter;
  onFilterChange: (filter: TripFilter) => void;
  onEdit: (trip: Trip) => void;
  onDelete: (trip: Trip) => void;
}

interface DayGroup {
  date: string;
  trips: Trip[];
}

interface MonthGroup {
  monthKey: string;
  km: number;
  tripCount: number;
  days: DayGroup[];
}

function groupTrips(trips: Trip[]): MonthGroup[] {
  const months = new Map<string, { km: number; tripCount: number; days: Map<string, Trip[]> }>();

  for (const trip of trips) {
    const monthKey = trip.date.slice(0, 7);
    const bucket = months.get(monthKey) ?? { km: 0, tripCount: 0, days: new Map<string, Trip[]>() };
    if (trip.totalKm !== null && trip.totalKm !== undefined) bucket.km += trip.totalKm;
    bucket.tripCount += 1;
    const dayTrips = bucket.days.get(trip.date) ?? [];
    dayTrips.push(trip);
    bucket.days.set(trip.date, dayTrips);
    months.set(monthKey, bucket);
  }

  // 月份与日期的顺序都由前端按 `YYYY-MM` / `YYYY-MM-DD` 降序决定，不依赖后端的 ORDER BY
  return [...months.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([monthKey, bucket]) => ({
      monthKey,
      km: Math.round(bucket.km * 100) / 100,
      tripCount: bucket.tripCount,
      days: [...bucket.days.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
        .map(([date, dayTrips]) => ({ date, trips: dayTrips })),
    }));
}

export function RecordsView({ trips, filter, onFilterChange, onEdit, onDelete }: RecordsViewProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sort, setSort] = useState<RecordSort>("recent");

  const matched = useMemo(() => filterTrips(trips, filter), [trips, filter]);
  const summary = useMemo(() => summarize(matched), [matched]);

  // 条件或排序一变就回到第一页；依赖 filter / sort 的引用（不是 matched，它每次渲染都是新数组）
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter, sort]);

  const ordered = useMemo(() => sortTrips(matched, sort), [matched, sort]);
  const months = useMemo(() => groupTrips(ordered.slice(0, visibleCount)), [ordered, visibleCount]);
  const remaining = ordered.length - visibleCount;

  const clearConditions = () =>
    onFilterChange({ ...filter, keyword: "", missingOnly: false, constraints: [] });

  const removeConstraint = (kind: string, key: string) =>
    onFilterChange({
      ...filter,
      constraints: filter.constraints.filter((item) => !(item.kind === kind && item.key === key)),
    });

  const renderTrip = (trip: Trip) => {
    const missingKm = trip.totalKm === null || trip.totalKm === undefined;
    const legsWithKm = (trip.legs ?? []).filter((leg) => leg.km !== null && leg.km !== undefined);
    return (
      <Card component="article" variant="outlined" key={trip.id}>
        <CardContent>
          <Stack spacing={1}>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {chainText(trip.nodes)}
            </Typography>

            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.75 }}
            >
              {/* 总公里数是「读数」：用墨色数字（与汇总页的读数同一套写法），不用胶囊——蓝色只留给可操作与选中；
                  只有真的缺里程时才用琥珀这个状态色，并直接把状态写出来 */}
              <Typography
                variant="body1"
                sx={{
                  fontWeight: 650,
                  fontVariantNumeric: "tabular-nums",
                  color: missingKm ? "warning.main" : "text.primary",
                }}
              >
                {missingKm ? "未填里程" : `${formatKm(trip.totalKm)} 公里`}
              </Typography>
              {trip.source === "import" ? <Chip size="small" color="default" label="导入" /> : null}
              {trip.note ? (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {trip.note}
                </Typography>
              ) : null}
              <Button
                size="small"
                sx={{ ml: "auto" }}
                startIcon={<EditOutlined fontSize="small" />}
                onClick={() => onEdit(trip)}
              >
                编辑
              </Button>
              <Button
                size="small"
                color="error"
                startIcon={<DeleteOutlined fontSize="small" />}
                onClick={() => onDelete(trip)}
              >
                删除
              </Button>
            </Stack>

            {legsWithKm.length > 0 ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {legsWithKm.map((leg) => `${leg.from} → ${leg.to} ${formatKm(leg.km)}`).join(" · ")}
              </Typography>
            ) : null}
          </Stack>
        </CardContent>
      </Card>
    );
  };

  const renderDayHeading = (date: string, trailing?: string) => (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5, mb: 0.75 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {formatDateLabel(date)}
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {weekdayLabel(date)}
      </Typography>
      {trailing ? (
        <Typography
          variant="body2"
          sx={{ ml: "auto", color: "text.secondary", fontVariantNumeric: "tabular-nums" }}
        >
          {trailing}
        </Typography>
      ) : null}
    </Stack>
  );

  const queryCard = (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h3" component="h3" sx={{ mb: 1 }}>
          查询条件
        </Typography>
        <RangeControl value={filter.range} onChange={(range) => onFilterChange({ ...filter, range })} />

        <Stack spacing={1} sx={{ mt: 1.5 }}>
          <TextField
            label="关键词"
            placeholder="节点名或备注"
            value={filter.keyword}
            onChange={(event) => onFilterChange({ ...filter, keyword: event.target.value })}
            fullWidth
          />
          <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", columnGap: 1, rowGap: 0.75 }}>
            <Typography variant="body2" sx={{ color: "text.secondary", minWidth: "3rem" }}>
              排序
            </Typography>
            <PillGroup label="排序" options={SORT_OPTIONS} value={sort} onChange={setSort} />
          </Stack>
          <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", columnGap: 1, rowGap: 0.75 }}>
            <Typography variant="body2" sx={{ color: "text.secondary", minWidth: "3rem" }}>
              里程
            </Typography>
            <PillGroup
              label="里程筛选"
              options={[
                { value: "any", label: "全部" },
                { value: "missing", label: "只看未填里程" },
              ]}
              value={filter.missingOnly ? "missing" : "any"}
              onChange={(value) => onFilterChange({ ...filter, missingOnly: value === "missing" })}
            />
          </Stack>
        </Stack>

        <Stack
          direction="row"
          sx={{
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            columnGap: 1,
            rowGap: 0.5,
            mt: 2,
            pt: 1.5,
            borderTop: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
            {rangeLabel(filter.range)} · 共 {summary.tripCount} 条 · 合计 {formatKm(summary.totalKm)} 公里
            {summary.missingKm > 0 ? ` · ${summary.missingKm} 条未填里程` : ""}
          </Typography>
          {hasConditions(filter) ? (
            <Button size="small" onClick={clearConditions}>
              清空条件
            </Button>
          ) : null}
        </Stack>

        {filter.constraints.length > 0 ? (
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75, mt: 1 }}>
            {filter.constraints.map((constraint) => (
              <Chip
                key={`${constraint.kind}-${constraint.key}`}
                label={constraint.label}
                onDelete={() => removeConstraint(constraint.kind, constraint.key)}
              />
            ))}
          </Stack>
        ) : null}
      </CardContent>
    </Card>
  );

  if (trips.length === 0) {
    return (
      <Stack spacing={1.5}>
        {queryCard}
        <Alert severity="info">还没有行程记录，去「填报」添加第一条吧。</Alert>
      </Stack>
    );
  }

  return (
    <Stack spacing={1.5}>
      {queryCard}

      {matched.length === 0 ? (
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={clearConditions}>
              清空条件
            </Button>
          }
        >
          没有匹配的记录，换个范围或去掉条件试试。
        </Alert>
      ) : null}

      {sort === "km" ? (
        // 按里程是一条降序榜单：再按月/日分组会把排序藏起来，所以这时不分组，日期跟着每条走
        <Stack spacing={1.5}>
          {ordered.slice(0, visibleCount).map((trip) => (
            <Box key={trip.id}>
              {renderDayHeading(trip.date)}
              {renderTrip(trip)}
            </Box>
          ))}
        </Stack>
      ) : (
        months.map((month) => (
          <Box component="section" key={month.monthKey}>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "baseline", justifyContent: "space-between", mb: 1 }}
            >
              <Typography variant="h3" component="h3">
                {formatMonthLabel(month.monthKey)}
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
                {month.tripCount} 条 · {formatKm(month.km)} 公里
              </Typography>
            </Stack>

            <Stack spacing={1.5}>
              {month.days.map((day) => {
                const dayKm =
                  Math.round(day.trips.reduce((sum, trip) => sum + (trip.totalKm ?? 0), 0) * 100) / 100;
                return (
                  <Box key={day.date}>
                    {renderDayHeading(day.date, `${formatKm(dayKm)} 公里`)}
                    <Stack spacing={1}>{day.trips.map(renderTrip)}</Stack>
                  </Box>
                );
              })}
            </Stack>
          </Box>
        ))
      )}

      {remaining > 0 ? (
        <Button variant="outlined" onClick={() => setVisibleCount((value) => value + PAGE_SIZE)}>
          显示更多（还有 {remaining} 条）
        </Button>
      ) : null}
    </Stack>
  );
}