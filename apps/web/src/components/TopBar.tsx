import { useRef, useState } from "react";
import {
  AppBar,
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
} from "@mui/material";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import KeyRoundedIcon from "@mui/icons-material/KeyRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import type { User } from "../types";

interface TopBarProps {
  user: User;
  onOpenPassword: () => void;
  onExport: () => void;
  onLogout: () => void;
}

/** 顶栏：品牌（全站唯一的 h1）+ 当前用户 + 更多操作菜单（Esc / 点击外部关闭由 MUI Menu 负责）。 */
export function TopBar({ user, onOpenPassword, onExport, onLogout }: TopBarProps) {
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
      <Toolbar sx={{ gap: 1 }}>
        <Box component="img" src="/icon.svg" alt="" sx={{ width: 26, height: 26, borderRadius: "8px" }} />
        <Typography variant="h1" component="h1" sx={{ fontSize: "1.125rem" }}>
          途迹
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ maxWidth: "32vw", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
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
