import { Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface FilterRowProps {
  /** 行首常驻小标签（维度 / 排序 / 里程）。标签常驻，不靠 placeholder 承担。 */
  label: string;
  children: ReactNode;
}

/**
 * 查询条件里「小标签 + 控件」的一行：记录页与汇总页共用（DESIGN.md「查询条件」）。
 * 曾两页各写四份同样的 Stack + Typography，label 列宽各自硬编码。
 */
export function FilterRow({ label, children }: FilterRowProps) {
  return (
    <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", columnGap: 1, rowGap: 0.75 }}>
      <Typography variant="body2" sx={{ color: "text.secondary", minWidth: "3rem" }}>
        {label}
      </Typography>
      {children}
    </Stack>
  );
}