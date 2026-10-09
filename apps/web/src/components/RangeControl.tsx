import { Stack, Typography } from "@mui/material";
import { DateField } from "./DateField";
import { PillGroup } from "./PillGroup";
import { RANGE_PRESETS, resolveRange, type DateRange, type RangePreset } from "../lib/query";
import { todayIso } from "../lib/format";

interface RangeControlProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

/** 时间范围：快捷档（本月 / 本年 / 去年 / 全部）+ 自定义起止；汇总页与记录页共用。 */
export function RangeControl({ value, onChange }: RangeControlProps) {
  const handlePreset = (preset: RangePreset) => {
    if (preset === "custom") {
      const today = todayIso();
      // 切到自定义时以上一份范围的读数为起点，避免出现空范围
      onChange(
        resolveRange("custom", {
          customFrom: value.from ?? `${today.slice(0, 4)}-01-01`,
          customTo: value.to ?? today,
        }),
      );
      return;
    }
    onChange(resolveRange(preset));
  };

  return (
    <Stack spacing={1}>
      <PillGroup label="时间范围" options={RANGE_PRESETS} value={value.preset} onChange={handlePreset} />
      {value.preset === "custom" ? (
        <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
          <DateField
            label="起始"
            value={value.from}
            onChange={(iso) => onChange({ ...value, from: iso })}
          />
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            至
          </Typography>
          <DateField label="截止" value={value.to} onChange={(iso) => onChange({ ...value, to: iso })} />
        </Stack>
      ) : null}
    </Stack>
  );
}