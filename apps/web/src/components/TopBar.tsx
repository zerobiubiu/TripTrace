import { useRef, useState } from "react";
import {
  AppBar,
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Tab,
  Tabs,
  Toolbar,
  Typography,
} from "@mui/material";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import { radius } from "../theme";
import AccountCircleRoundedIcon from "@mui/icons-material/AccountCircleRounded";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import type { TabKey, User } from "../types";

/** 分组导航项（唯一来源）：顶栏内联展示，移动端与桌面端同一形态。 */
export const TAB_ITEMS = [
  { key: "entry", label: "填报" },
  { key: "records", label: "记录" },
  { key: "stats", label: "汇总" },
  { key: "import", label: "导入" },
] as const satisfies ReadonlyArray<{ key: TabKey; label: string }>;

interface TopBarProps {
  user: User;
  active: TabKey;
  /** 是否管理员：决定账号菜单里是否出现「管理」入口 */
  isAdmin: boolean;
  onChangeTab: (tab: TabKey) => void;
  onOpenAccount: () => void;
  onOpenAdmin: () => void;
  onOpenPassword: () => void;
  onExport: () => void;
  onLogout: () => void;
}

/** 顶栏：品牌（全站唯一的 h1）+ 分组导航 + 账号菜单（Esc / 点击外部关闭由 MUI Menu 负责）。 */
export function TopBar({
  user,
  active,
  isAdmin,
  onChangeTab,
  onOpenAccount,
  onOpenAdmin,
  onOpenPassword,
  onExport,
  onLogout,
}: TopBarProps) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  const runAndClose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <AppBar
      position="sticky"
      color="transparent"
      elevation={0}
      sx={{ bgcolor: "background.paper", borderBottom: 1, borderColor: "divider" }}
    >
      <Toolbar sx={{ gap: { xs: 0.5, sm: 1 }, px: { xs: 1, sm: 2 }, minHeight: { xs: 52, sm: 56 } }}>
        <Box component="img" src="/icon.svg" alt="" sx={{ width: 26, height: 26, borderRadius: radius.icon }} />
        <Typography variant="h1" component="h1" sx={{ fontSize: "1.125rem", mr: { xs: 0.5, sm: 1 } }}>
          途迹
        </Typography>

        <Tabs
          value={active}
          onChange={(_event, value: TabKey) => onChangeTab(value)}
          variant="scrollable"
          scrollButtons={false}
          allowScrollButtonsMobile
          aria-label="主导航"
          sx={{
            minHeight: 48,
            "& .MuiTab-root": {
              minHeight: 48,
              minWidth: { xs: 52, sm: 64 },
              px: { xs: 1, sm: 1.5 },
              fontSize: "0.9375rem",
              fontWeight: 600,
            },
          }}
        >
          {TAB_ITEMS.map(({ key, label }) => (
            <Tab key={key} value={key} label={label} />
          ))}
        </Tabs>

        <Box sx={{ flex: 1 }} />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: { xs: "none", sm: "block" },
            maxWidth: "22vw",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {user.displayName}
        </Typography>
        <IconButton
          ref={anchorRef}
          aria-label="更多操作"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <MoreVertRoundedIcon />
        </IconButton>
        <Menu
          anchorEl={anchorRef.current}
          open={open}
          onClose={() => setOpen(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
        >
          <MenuItem onClick={runAndClose(onOpenAccount)}>
            <ListItemIcon>
              <AccountCircleRoundedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>账号</ListItemText>
          </MenuItem>
          {isAdmin ? (
            <MenuItem onClick={runAndClose(onOpenAdmin)}>
              <ListItemIcon>
                <AdminPanelSettingsRoundedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>管理</ListItemText>
            </MenuItem>
          ) : null}
          <MenuItem onClick={runAndClose(onOpenPassword)}>
            <ListItemIcon>
              <KeyRoundedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>修改密码</ListItemText>
          </MenuItem>
          <MenuItem onClick={runAndClose(onExport)}>
            <ListItemIcon>
              <DownloadRoundedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>导出数据（JSON）</ListItemText>
          </MenuItem>
          <MenuItem onClick={runAndClose(onLogout)}>
            <ListItemIcon>
              <LogoutRoundedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>退出登录</ListItemText>
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
