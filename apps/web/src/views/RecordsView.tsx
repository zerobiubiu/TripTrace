import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import { chainText, formatDateLabel, formatKm, formatMonthLabel, weekdayLabel } from "../lib/format";
import type { Trip } from "../types";

/** 首屏只渲染最新的 60 条，避免上百条行程一次全部挂载。 */
const PAGE_SIZE = 60;

/** Chip 自带字号是 13px（`size="small"` 为 12px），低于关键数字的 14px 下限，这里统一抬到 body2。 */
const CHIP_FONT_SX = { fontSize: "0.875rem" };

interface RecordsViewProps {
  trips: Trip[];
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

export function RecordsView({ trips, onEdit, onDelete }: RecordsViewProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [trips]);

  // 分页口径是「最新的 60 条」：先按日期降序（同日保持接口原始顺序），再截取
  const ordered = useMemo(
    () => [...trips].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [trips],
  );
  const months = useMemo(() => groupTrips(ordered.slice(0, visibleCount)), [ordered, visibleCount]);
  const hasMore = visibleCount < ordered.length;

  if (trips.length === 0) {
    return <Alert severity="info">还没有行程记录，去「填报」添加第一条吧。</Alert>;
  }

  return (
    <Stack spacing={1.5}>
      {months.map((month) => (
        <Box component="section" key={month.monthKey}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "baseline", justifyContent: "space-between", mb: 1 }}
          >
            <Typography variant="h3" component="h3">
              {formatMonthLabel(month.monthKey)}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              {month.tripCount} 条 · {formatKm(month.km)} 公里
            </Typography>
          </Stack>

          <Stack spacing={1.5}>
            {month.days.map((day) => {
              const dayKm = Math.round(day.trips.reduce((sum, trip) => sum + (trip.totalKm ?? 0), 0) * 100) / 100;
              return (
                <Box key={day.date}>
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5, mb: 0.75 }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {formatDateLabel(day.date)}
                    </Typography>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      {weekdayLabel(day.date)}
                    </Typography>
                    <Chip size="small" label={`${formatKm(dayKm)} 公里`} sx={{ ...CHIP_FONT_SX, ml: "auto" }} />
                  </Stack>

                  <Stack spacing={1}>
                    {day.trips.map((trip) => {
                      const missingKm = trip.totalKm === null || trip.totalKm === undefined;
                      const legsWithKm = (trip.legs ?? []).filter((leg) => leg.km !== null && leg.km !== undefined);
                      return (
                        <Card component="article" key={trip.id} variant="outlined">
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
                                <Chip
                                  size="small"
                                  color={missingKm ? "warning" : "primary"}
                                  label={missingKm ? "未填里程" : `${formatKm(trip.totalKm)} 公里`}
                                  sx={CHIP_FONT_SX}
                                />
                                {trip.source === "import" ? (
                                  <Chip size="small" color="default" label="导入" sx={CHIP_FONT_SX} />
                                ) : null}
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
                                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                  {legsWithKm
                                    .map((leg) => `${leg.from} → ${leg.to} ${formatKm(leg.km)}`)
                                    .join(" · ")}
                                </Typography>
                              ) : null}
                            </Stack>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </Stack>
                </Box>
              );
            })}
          </Stack>
        </Box>
      ))}

      {hasMore ? (
        <Button variant="outlined" fullWidth onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
          显示更早的 60 条
        </Button>
      ) : null}
    </Stack>
  );
}
