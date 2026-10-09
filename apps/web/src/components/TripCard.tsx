import { Button, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import { chainText, formatKm } from "../lib/format";
import { radius } from "../theme";
import type { Trip } from "../types";

/**
 * 行程卡（两处共用）：填报页「当日记录」与记录页列表都是这个组件——
 * **改一处两处同时生效**，不要再在视图里另写一份（0.9.3 之前就是各写一份，改了一处漏了一处）。
 *
 * - `full`：记录页的主列表卡（纸白卡片、`body1` 标题、带分段明细）
 * - `compact`：填报页当日记录的紧凑行（1px 描边块、`body2` 标题、不带分段明细）
 */

export type TripCardVariant = "full" | "compact";

interface MileageReadingProps {
  km: number | null | undefined;
  /** 数字档位：主列表 `body1`、紧凑行 `body2` */
  variant?: "body1" | "body2";
}

/**
 * 里程**读数**（原子）：墨色 + 650 + 等宽数字；缺里程时用琥珀文字把状态写出来。
 * 读数是文字，不是胶囊——蓝色只表示「可操作 / 已选中」（DESIGN.md 的 The Reading-Not-Pill Rule）。
 */
export function MileageReading({ km, variant = "body1" }: MileageReadingProps) {
  const missing = km === null || km === undefined;
  return (
    <Typography
      variant={variant}
      sx={{
        fontWeight: 650,
        fontVariantNumeric: "tabular-nums",
        color: missing ? "warning.main" : "text.primary",
      }}
    >
      {missing ? "未填里程" : `${formatKm(km)} 公里`}
    </Typography>
  );
}

interface TripCardProps {
  trip: Trip;
  variant?: TripCardVariant;
  onEdit: (trip: Trip) => void;
  onDelete: (trip: Trip) => void;
}

export function TripCard({ trip, variant = "full", onEdit, onDelete }: TripCardProps) {
  const full = variant === "full";
  const legsWithKm = (trip.legs ?? []).filter((leg) => leg.km !== null && leg.km !== undefined);

  const body = (
    <Stack spacing={full ? 1 : 0.5}>
      <Typography variant={full ? "body1" : "body2"} sx={{ fontWeight: 600 }}>
        {chainText(trip.nodes)}
      </Typography>

      <Stack
        direction="row"
        spacing={full ? 1 : 0.5}
        sx={{ alignItems: "center", flexWrap: "wrap", rowGap: full ? 0.75 : 0.5 }}
      >
        <MileageReading km={trip.totalKm} variant={full ? "body1" : "body2"} />
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

      {full && legsWithKm.length > 0 ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {legsWithKm.map((leg) => `${leg.from} → ${leg.to} ${formatKm(leg.km)}`).join(" · ")}
        </Typography>
      ) : null}
    </Stack>
  );

  if (full) {
    return (
      <Card component="article" variant="outlined">
        <CardContent>{body}</CardContent>
      </Card>
    );
  }

  return (
    <Stack sx={{ p: 1.25, border: 1, borderColor: "divider", borderRadius: radius.control }}>{body}</Stack>
  );
}