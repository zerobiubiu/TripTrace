import {
  BottomNavigation,
  BottomNavigationAction,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import EditNoteRoundedIcon from "@mui/icons-material/EditNoteRounded";
import ListAltRoundedIcon from "@mui/icons-material/ListAltRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import FileUploadRoundedIcon from "@mui/icons-material/FileUploadRounded";
import type { TabKey } from "../types";

const TABS = [
  { key: "entry", label: "填报", Icon: EditNoteRoundedIcon },
  { key: "records", label: "记录", Icon: ListAltRoundedIcon },
  { key: "stats", label: "汇总", Icon: InsightsRoundedIcon },
  { key: "import", label: "导入", Icon: FileUploadRoundedIcon },
] as const;

/** 移动端是底部导航；≥900px 变左侧竖排导航（同一份数据，两种呈现）。 */
export function NavTabs({ active, onChange }: { active: TabKey; onChange: (tab: TabKey) => void }) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));

  if (isDesktop) {
    return (
      <Paper
        component="nav"
        aria-label="主导航"
        variant="outlined"
        sx={{ width: 200, flex: "0 0 200px", p: 0.5, position: "sticky", top: 88 }}
      >
        <List dense disablePadding sx={{ display: "grid", gap: 0.5 }}>
          {TABS.map(({ key, label, Icon }) => (
            <ListItemButton
              key={key}
              selected={key === active}
              aria-current={key === active ? "page" : undefined}
              onClick={() => onChange(key)}
            >
              <ListItemIcon sx={{ minWidth: 34 }}>
                <Icon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={label} slotProps={{ primary: { sx: { fontWeight: 600 } } }} />
            </ListItemButton>
          ))}
        </List>
      </Paper>
    );
  }

  return (
    <Paper
      component="nav"
      aria-label="主导航"
      square
      elevation={8}
      sx={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: (t) => t.zIndex.appBar,
        pb: "env(safe-area-inset-bottom)",
      }}
    >
      <BottomNavigation showLabels value={active} onChange={(_event, value: TabKey) => onChange(value)}>
        {TABS.map(({ key, label, Icon }) => (
          <BottomNavigationAction key={key} value={key} label={label} icon={<Icon />} />
        ))}
      </BottomNavigation>
    </Paper>
  );
}
