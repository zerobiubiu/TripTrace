import { useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  IconButton,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import { formatKm } from "../lib/format";
import { computeStats } from "../lib/suggest";
import type { Trip } from "../types";

/** 数字列等宽对齐：切换年份、数值变化时不跳列宽。 */
const tabularNums = { fontVariantNumeric: "tabular-nums" } as const;

export function StatsView({ trips }: { trips: Trip[] }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const stats = useMemo(() => computeStats(trips, year), [trips, year]);
  const maxMonthKm = Math.max(...stats.months.map((month) => month.km), 1);
  const metrics = [
    { label: "总里程（公里）", value: formatKm(stats.totalKm) },
    { label: "行程次数", value: String(stats.tripCount) },
    { label: "出行天数", value: String(stats.dayCount) },
    { label: "未填里程", value: String(stats.missingKm) },
  ];

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", columnGap: 1 }}>
        <Typography variant="h3" component="h3">
          年度汇总
        </Typography>
        <Stack direction="row" sx={{ alignItems: "center", columnGap: 0.5 }}>
          <IconButton aria-label={`上一年（${year - 1} 年）`} onClick={() => setYear((value) => value - 1)}>
            <ChevronLeftRoundedIcon />
          </IconButton>
          <Typography
            variant="body2"
            aria-live="polite"
            sx={{ minWidth: "4.5rem", textAlign: "center", fontWeight: 650, ...tabularNums }}
          >
            {stats.year} 年
          </Typography>
          <IconButton aria-label={`下一年（${year + 1} 年）`} onClick={() => setYear((value) => value + 1)}>
            <ChevronRightRoundedIcon />
          </IconButton>
        </Stack>
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" },
          gap: 1.5,
        }}
      >
        {metrics.map((metric) => (
          <Card key={metric.label} variant="outlined">
            <CardContent>
              <Typography variant="h1" sx={tabularNums}>
                {metric.value}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {metric.label}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h3" component="h3" sx={{ mb: 1.25 }}>
            月度分布
          </Typography>
          {stats.tripCount === 0 ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              这一年还没有记录；换一年看看，或先去填报页记一笔。
            </Typography>
          ) : (
            <Stack spacing={1}>
              {stats.months.map((month) => (
                <Box
                  key={month.month}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "3.25rem minmax(0, 1fr) 3.5rem",
                    alignItems: "center",
                    columnGap: 1.5,
                  }}
                >
                  <Typography variant="body2" sx={{ color: "text.secondary", ...tabularNums }}>
                    {month.month} 月
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={Math.round((month.km / maxMonthKm) * 100)}
                    aria-label={`${month.month} 月里程`}
                  />
                  <Typography variant="body2" sx={{ textAlign: "right", ...tabularNums }}>
                    {formatKm(month.km)}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h3" component="h3" sx={{ mb: 1.25 }}>
            高频路段
          </Typography>
          {stats.topLegs.length === 0 ? (
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              还没有分段里程数据；在填报时填写分段，或在导入时带上每段距离。
            </Typography>
          ) : (
            <Stack spacing={1}>
              {stats.topLegs.map((leg) => (
                <Stack
                  key={`${leg.from}-${leg.to}`}
                  direction="row"
                  sx={{ alignItems: "baseline", justifyContent: "space-between", columnGap: 1.5 }}
                >
                  <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    {leg.from} → {leg.to}
                  </Typography>
                  <Stack direction="row" sx={{ alignItems: "baseline", columnGap: 1, flexShrink: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, ...tabularNums }}>
                      {formatKm(leg.km)} 公里
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary", ...tabularNums }}>
                      {leg.count} 次
                    </Typography>
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
