import { useState } from "react";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";

/**
 * 弹层内 MUI X 的默认字号（overline 13.7px、星期标签 12px）抬到 14px 下限；
 * 窄屏走 dialog 变体、宽屏走 popper 变体，两处都要挂。
 */
const PICKER_TEXT_SX = {
  "& .MuiTypography-overline": { fontSize: "0.875rem" },
  "& .MuiDayCalendar-weekDayLabel": { fontSize: "0.875rem" },
} as const;

interface DateFieldProps {
  label: string;
  /** ISO 日期（`YYYY-MM-DD`）；null 表示未选 */
  value: string | null;
  onChange: (iso: string) => void;
  /** 默认 132：宽度贴合日期读数，值因此在框内居中 */
  width?: number;
}

/**
 * 只读日期字段：日期只选不敲（`readOnly` + 整块可点打开选择器），
 * 装饰性的日历图标隐藏——位置让给读数本身；值居中且等宽数字。
 * 填报页与查询条件共用，避免出现第二套日期字段。
 */
export function DateField({ label, value, onChange, width = 132 }: DateFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <DatePicker
      label={label}
      value={value ? dayjs(value) : null}
      format="YYYY/MM/DD"
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      onChange={(next) => {
        if (next && next.isValid()) onChange(next.format("YYYY-MM-DD"));
      }}
      slotProps={{
        textField: {
          sx: {
            width,
            "& .MuiInputAdornment-root": { display: "none" },
            // MUI X v9 的值渲染在 .MuiPickersSectionList-root 里（不是 <input>）
            "& .MuiPickersSectionList-root": { fontVariantNumeric: "tabular-nums" },
          },
          // 点整块就弹选择器；键盘 Enter/空格/↓ 同样打开
          onClick: () => setOpen(true),
          onKeyDown: (event) => {
            if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
            }
          },
          slotProps: {
            htmlInput: { readOnly: true, "aria-haspopup": "dialog" },
          },
        },
        field: { clearable: false },
        popper: { sx: PICKER_TEXT_SX },
        dialog: { sx: PICKER_TEXT_SX },
      }}
    />
  );
}