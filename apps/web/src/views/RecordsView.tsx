/**
 * 「记录」页（0.7.0 起记录与汇总合并为一个查询区）：
 * ① 单日筛查——StaticDatePicker 常显日历（可收起），只选一天，带「回到今天」；
 * ② 当天明细——只显示选中那天的行程（卡片：链、里程、来源、分段、编辑/删除）；
 * ③ 独立汇总区——原「汇总」内容（年度汇总 / 月度分布 / 高频路段，带自己的年份选择）折叠保留。
 */

import { useMemo, useState } from "react";
import { Alert, Box, Button, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import { StaticDatePicker } from "@mui/x-date-pickers/StaticDatePicker";
import dayjs from "dayjs";
import { chainText, formatDateLabel, formatKm, todayIso, weekdayLabel } from "../lib/format";
import type { Trip } from "../types";
import { StatsView } from "./StatsView";

interface RecordsViewProps {
  trips: Trip[];
  onEdit: (trip: Trip) => void;
  onDelete: (trip: Trip) => void;
}

/** 与填报页同口径：MUI X 弹层里的 overline / 星期标签默认小于 14px，这里抬到下限。 */
const PICKER_TEXT_SX = {
  "& .MuiTypography-overline": { fontSize: "0.875rem" },
  "& .MuiDayCalendar-weekDayLabel": { fontSize: "0.875rem" },
} as const;

/** 可折叠区块的标题行：标题 + 摘要 + 展开/收起（aria-expanded/controls 齐全）。 */
function SectionHeader({
  title,
  meta,
  open,
  controls,
  onToggle,
}: {
  title: string;
  meta?: string;
  open: boolean;
  controls: string;
  onToggle: () => void;
}) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
      <Typography variant="h3" component="h3">
        {title}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
        {meta ? (
          <Typography variant="caption" sx={{ color: "text.secondary", textAlign: "right" }}>
            {meta}
          </Typography>
        ) : null}
        <Button
          size="small"
          variant="outlined"
          sx={{ minHeight: 44, flex: "0 0 auto" }}
          aria-expanded={open}
          aria-controls={controls}
          onClick={onToggle}
        >
          {open ? "收起" : "展开"}
        </Button>
      </Stack>
    </Stack>
  );
}

export function RecordsView({ trips, onEdit, onDelete }: RecordsViewProps) {
  const [selectedDate, setSelectedDate] = useState(() => todayIso());
  const [calendarOpen, setCalendarOpen] = useState(true);
  const [statsOpen, setStatsOpen] = useState(false);

  const dayTrips = useMemo(
    () =>
      trips
        .filter((trip) => trip.date === selectedDate)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)),
    [trips, selectedDate],
  );
  const dayKm = useMemo(
    () => Math.round(dayTrips.reduce((sum, trip) => sum + (trip.totalKm ?? 0), 0) * 100) / 100,
    [dayTrips],
  );
  const dayMissing = dayTrips.filter((trip) => trip.totalKm === null || trip.totalKm === undefined).length;

  return (
    <Stack spacing={1.5}>
      <Card variant="outlined">
        <CardContent>
          <SectionHeader
            title="按日期查看"
            meta={`${formatDateLabel(selectedDate)} ${weekdayLabel(selectedDate)}`}
            open={calendarOpen}
            controls="records-calendar"
            onToggle={() => setCalendarOpen((current) => !current)}
          />
          {calendarOpen ? (
            <Box
              id="records-calendar"
              sx={{ mt: 1, ...PICKER_TEXT_SX, "& .MuiDateCalendar-root": { width: "100%", maxWidth: 360, mx: "auto" } }}
            >
              <StaticDatePicker
                value={dayjs(selectedDate)}
                onChange={(value) => {
                  if (value?.isValid()) setSelectedDate(value.format("YYYY-MM-DD"));
                }}
                // 静态日历即筛即用，不需要「确认/取消」动作条
                slotProps={{ actionBar: { actions: [] } }}
              />
              <Button
                fullWidth
                sx={{ minHeight: 44 }}
                disabled={selectedDate === todayIso()}
                onClick={() => setSelectedDate(todayIso())}
              >
                回到今天
              </Button>
            </Box>
          ) : null}
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h3" component="h3" sx={{ mb: 1 }}>
            {formatDateLabel(selectedDate)} 的记录
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 1.5 }}>
            {dayTrips.length === 0
              ? "这一天还没有记录"
              : `已录 ${dayTrips.length} 条 · 合计 ${formatKm(dayKm)} 公里${dayMissing > 0 ? ` · ${dayMissing} 条未填里程` : ""}`}
          </Typography>

          <Stack spacing={1}>
            {dayTrips.map((trip) => {
              const missingKm = trip.totalKm === null || trip.totalKm === undefined;
              const legsWithKm = (trip.legs ?? []).filter((leg) => leg.km !== null && leg.km !== undefined);
              return (
                <Card component="article" key={trip.id} variant="outlined">
                  <CardContent>
                    <Stack spacing={1}>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        {chainText(trip.nodes)}
                      </Typography>

                      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.75 }}>
                        <Chip
                          size="small"
                          color={missingKm ? "warning" : "primary"}
                          label={missingKm ? "未填里程" : `${formatKm(trip.totalKm)} 公里`}
                        />
                        {trip.source === "import" ? <Chip size="small" color="default" label="导入" /> : null}
                        {trip.note ? (
                          <Typography variant="body2" sx={{ color: "text.secondary" }}>
                            {trip.note}
                          </Typography>
                        ) : null}
                        <Button
                          size="small"
                          sx={{ ml: "auto", minHeight: 44 }}
                          startIcon={<EditOutlined fontSize="small" />}
                          aria-label={`编辑 ${chainText(trip.nodes)}`}
                          onClick={() => onEdit(trip)}
                        >
                          编辑
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          sx={{ minHeight: 44 }}
                          startIcon={<DeleteOutlined fontSize="small" />}
                          aria-label={`删除 ${chainText(trip.nodes)}`}
                          onClick={() => onDelete(trip)}
                        >
                          删除
                        </Button>
                      </Stack>

                      {legsWithKm.length > 0 ? (
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          {legsWithKm.map((leg) => `${leg.from} → ${leg.to} ${formatKm(leg.km)}`).join(" · ")}
                        </Typography>
                      ) : null}
                    </Stack>
                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <SectionHeader
            title="汇总"
            meta={trips.length === 0 ? "还没有数据" : `共 ${trips.length} 条记录`}
            open={statsOpen}
            controls="records-stats"
            onToggle={() => setStatsOpen((current) => !current)}
          />
          {statsOpen ? (
            <Box id="records-stats" sx={{ mt: 1.5 }}>
              <StatsView trips={trips} />
            </Box>
          ) : (
            <Alert severity="info" sx={{ mt: 1.5 }}>
              展开可看年度汇总、月度分布与高频路段
            </Alert>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}