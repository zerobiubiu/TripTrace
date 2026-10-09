import { Alert, Button } from "@mui/material";
import type { AlertColor } from "@mui/material";
import type { ReactNode } from "react";
import { touchTargetSx } from "../theme";

interface NoticeAction {
  label: string;
  run: () => void;
  /** 动作按钮的无障碍名：一页里可能同时有多条提示，光写「重试」说不清重试的是什么。 */
  ariaLabel?: string;
}

interface NoticeProps {
  severity: AlertColor;
  children: ReactNode;
  /** 最多一个动作——空态「去填报」、读不到数据「重试」、被筛空「清空条件」（The Plain-Recovery Rule）。 */
  action?: NoticeAction;
}

/**
 * 提示条的唯一实现：一句现状 + 至多一个动作。
 * 空态、读不到数据、视图兜底三处共用它（DESIGN.md「提示条与单一出路」），不要再各写一份 `Alert + Button`。
 */
export function Notice({ severity, children, action }: NoticeProps) {
  return (
    <Alert
      severity={severity}
      action={
        action ? (
          <Button
            color="inherit"
            size="small"
            sx={touchTargetSx}
            aria-label={action.ariaLabel}
            onClick={action.run}
          >
            {action.label}
          </Button>
        ) : undefined
      }
    >
      {children}
    </Alert>
  );
}