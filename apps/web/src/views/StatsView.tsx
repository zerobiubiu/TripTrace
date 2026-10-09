import { useMemo, useState } from "react";
import { Box, Button, Card, CardContent, Chip, LinearProgress, ListItemButton, Stack, Typography } from "@mui/material";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { FilterRow } from "../components/FilterRow";
import { Notice } from "../components/Notice";
import { PillGroup } from "../components/PillGroup";
import { RangeControl } from "../components/RangeControl";
import { formatKm, todayIso } from "../lib/format";
import {
  DEFAULT_SORT,
  DIMENSIONS,
  SORT_OPTIONS,
  aggregateLegs,
  aggregateMonths,
  aggregateNodes,
  aggregateRoutes,
  createFilter,
  drillForRow,
  filterTrips,
  rangeLabel,
  resolveRange,
  summarize,
  type DateRange,
  type Dimension,
  type LegRow,
  type MonthRow,
  type NodeRow,
  type RouteRow,
  type SortKey,
  type TripFilter,
} from "../lib/query";
import type { Trip } from "../types";

/** 先给前 10 项，避免「全部时间 + 按节点」这种组合一次铺开几十行。 */
const TOP_ROWS = 10;

/** 数字列等宽对齐：切换范围、维度、排序时数值不跳列宽。 */
const tabularNums = { fontVariantNumeric: "tabular-nums" } as const;

/** 列表里只说月日，年份由时间范围本身交代。 */
function shortDate(iso: string): string {
  if (!iso) return "—";
  return `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日`;
}

/** 四种维度统一成同一种行：一个主读数 + 一行次要读数，点行进明细。 */
interface DisplayRow {
  key: string;
  label: string;
  primary: string;
  caption: string;
  /** 月度维度的占比（0-1）；其他维度为 undefined */
  share?: number;
  drill: TripFilter;
}

const SECTION_TITLE: Record<Dimension, string> = {
  month: "各月份的里程",
  route: "各路线的里程",
  leg: "各分段的里程",
  node: "各节点的到达次数",
};

interface StatsViewProps {
  trips: Trip[];
  /** 点某一行 → 带着该行的条件跳到记录页看明细 */
  onDrill: (filter: TripFilter) => void;
  /** 一条记录都没有时的出路：去填报记第一笔（空态即引导，不另做引导流程） */
  onCreate: () => void;
}

export function StatsView({ trips, onDrill, onCreate }: StatsViewProps) {
  const [range, setRange] = useState<DateRange>(() => resolveRange("year", { today: todayIso() }));
  const [dimension, setDimension] = useState<Dimension>("month");
  const [sort, setSort] = useState<SortKey>(DEFAULT_SORT.month);
  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(() => filterTrips(trips, createFilter(range)), [trips, range]);
  const summary = useMemo(() => summarize(filtered), [filtered]);

  const rows = useMemo<DisplayRow[]>(() => {
    const base = createFilter(range);
    const mapMonths = (list: MonthRow[]): DisplayRow[] => {
      const max = Math.max(...list.map((row) => row.km), 0);
      return list.map((row) => ({
        key: row.key,
        label: row.label,
        primary: `${formatKm(row.km)} 公里`,
        caption: `${row.tripCount} 次 · ${row.dayCount} 天`,
        share: max > 0 ? row.km / max : 0,
        drill: drillForRow("month", row, base),
      }));
    };
    const mapRoutes = (list: RouteRow[]): DisplayRow[] =>
      list.map((row) => ({
        key: row.key,
        label: row.label,
        primary: `${formatKm(row.km)} 公里`,
        caption: [
          `${row.tripCount} 次`,
          row.avgKm === null ? null : `单次 ${formatKm(row.avgKm)} 公里`,
          `最近 ${shortDate(row.lastDate)}`,
        ]
          .filter(Boolean)
          .join(" · "),
        drill: drillForRow("route", row, base),
      }));
    const mapLegs = (list: LegRow[]): DisplayRow[] =>
      list.map((row) => ({
        key: row.key,
        label: row.label,
        primary: row.typicalKm === null ? "里程未填" : `单次 ${formatKm(row.typicalKm)} 公里`,
        caption: [
          `${row.count} 次`,
          `${row.tripCount} 条行程`,
          row.typicalKm === null ? null : `合计 ${formatKm(row.totalKm)} 公里`,
          `最近 ${shortDate(row.lastDate)}`,
        ]
          .filter(Boolean)
          .join(" · "),
        drill: drillForRow("leg", row, base),
      }));
    const mapNodes = (list: NodeRow[]): DisplayRow[] =>
      list.map((row) => ({
        key: row.key,
        label: row.label,
        primary: `${row.count} 次`,
        caption: `涉及 ${row.tripCount} 条行程 · 最近 ${shortDate(row.lastDate)}`,
        drill: drillForRow("node", row, base),
      }));

    switch (dimension) {
      case "month":
        return mapMonths(aggregateMonths(filtered, sort));
      case "route":
        return mapRoutes(aggregateRoutes(filtered, sort));
      case "leg":
        return mapLegs(aggregateLegs(filtered, sort));
      case "node":
        return mapNodes(aggregateNodes(filtered, sort));
    }
  }, [filtered, dimension, sort, range]);

  const visibleRows = expanded ? rows : rows.slice(0, TOP_ROWS);

  const metrics = [
    { label: "总里程", value: `${formatKm(summary.totalKm)} 公里` },
    { label: "行程次数", value: `${summary.tripCount} 次` },
    { label: "出行天数", value: `${summary.dayCount} 天` },
    { label: "单次均值", value: summary.avgKm === null ? "—" : `${formatKm(summary.avgKm)} 公里` },
  ];

  const handleDimension = (next: Dimension) => {
    setDimension(next);
    setSort(DEFAULT_SORT[next]);
    setExpanded(false);
  };

  return (
    <Box className="tt-query-grid">
      <Card className="tt-query-rail">
        <CardContent>
          <Typography variant="h3" component="h3" sx={{ mb: 1 }}>
            查询条件
          </Typography>
          <RangeControl value={range} onChange={setRange} />

          <Stack spacing={1} sx={{ mt: 1.5 }}>
            <FilterRow label="维度">
              <PillGroup label="统计维度" options={DIMENSIONS} value={dimension} onChange={handleDimension} />
            </FilterRow>
            <FilterRow label="排序">
              <PillGroup label="排序" options={SORT_OPTIONS[dimension]} value={sort} onChange={setSort} />
            </FilterRow>
          </Stack>

          <Box sx={{ mt: 2, pt: 1.5, borderTop: "1px solid", borderColor: "divider" }}>
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {rangeLabel(range)}
              </Typography>
              {summary.missingKm > 0 ? (
                <Chip
                  clickable
                  size="small"
                  color="warning"
                  icon={<WarningAmberRoundedIcon />}
                  label={`${summary.missingKm} 条未填里程`}
                  onClick={() => onDrill({ ...createFilter(range), missingOnly: true })}
                />
              ) : null}
            </Stack>

            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(8.5rem, 1fr))",
                gap: 1.5,
                mt: 1.25,
              }}
            >
              {metrics.map((metric) => (
                <Box key={metric.label}>
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    {metric.label}
                  </Typography>
                  <Typography variant="h2" component="p" sx={{ mt: 0.25, ...tabularNums }}>
                    {metric.value}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack
            direction="row"
            sx={{ alignItems: "baseline", justifyContent: "space-between", columnGap: 1, mb: 1 }}
          >
            <Typography variant="h3" component="h3">
              {SECTION_TITLE[dimension]}
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", ...tabularNums }}>
              {rows.length} 项
            </Typography>
          </Stack>

          {rows.length === 0 ? (
            trips.length === 0 ? (
              <Notice severity="info" action={{ label: "去填报", run: onCreate }}>
                还没有行程记录。
              </Notice>
            ) : (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                这一范围还没有记录
              </Typography>
            )
          ) : (
            <>
              <Stack spacing={0.5}>
                {visibleRows.map((row) => (
                  <ListItemButton
                    key={row.key}
                    onClick={() => onDrill(row.drill)}
                    aria-label={`${row.label}：查看明细`}
                    sx={{ p: 1.25, alignItems: "center", columnGap: 1, display: "flex" }}
                  >
                    <Stack sx={{ minWidth: 0, flex: 1 }} spacing={0.25}>
                      <Stack direction="row" sx={{ alignItems: "baseline", columnGap: 1.5 }}>
                        <Typography
                          variant="body2"
                          sx={{ flex: 1, minWidth: 0, fontWeight: 600, overflowWrap: "anywhere" }}
                        >
                          {row.label}
                        </Typography>
                        <Typography variant="body1" sx={{ flexShrink: 0, fontWeight: 650, ...tabularNums }}>
                          {row.primary}
                        </Typography>
                      </Stack>
                      {row.share === undefined ? null : (
                        <LinearProgress
                          variant="determinate"
                          value={Math.round(row.share * 100)}
                          aria-label={`${row.label}占比`}
                          sx={{ my: 0.25 }}
                        />
                      )}
                      <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "right", ...tabularNums }}>
                        {row.caption}
                      </Typography>
                    </Stack>
                    <ChevronRightRoundedIcon fontSize="small" sx={{ color: "text.secondary", flexShrink: 0 }} aria-hidden />
                  </ListItemButton>
                ))}
              </Stack>

              {rows.length > TOP_ROWS ? (
                <Button fullWidth sx={{ mt: 1 }} onClick={() => setExpanded((value) => !value)}>
                  {expanded ? "收起" : `显示全部 ${rows.length} 项`}
                </Button>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}