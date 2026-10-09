import { Chip, Stack } from "@mui/material";

export interface PillOption<T extends string> {
  value: T;
  label: string;
}

interface PillGroupProps<T extends string> {
  options: ReadonlyArray<PillOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** 组名（屏幕阅读器用），例如「时间范围」 */
  label: string;
}

/**
 * 单选胶囊组：沿用节点芯片的语言（36px 胶囊、选中＝软底 + 主色描边），
 * 用 `aria-pressed` 表达选中，横向可换行——窄屏不撑破，也不用横向滚动条。
 */
export function PillGroup<T extends string>({ options, value, onChange, label }: PillGroupProps<T>) {
  return (
    <Stack
      direction="row"
      role="group"
      aria-label={label}
      sx={{ flexWrap: "wrap", gap: 0.75, alignItems: "center" }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Chip
            key={option.value}
            clickable
            aria-pressed={selected}
            label={option.label}
            onClick={() => onChange(option.value)}
            sx={{
              border: "1px solid",
              borderColor: selected ? "primary.main" : "text.secondary",
              bgcolor: selected ? "primary.light" : "transparent",
              color: selected ? "primary.dark" : "text.secondary",
            }}
          />
        );
      })}
    </Stack>
  );
}