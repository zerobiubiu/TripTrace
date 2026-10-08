/**
 * 途迹 TripTrace 的 MUI 主题。
 *
 * 设计取舍与依据：
 * - 颜色：全部为主题令牌；成对对比度按 WCAG 2.2 计算并记录在注释里（正文 ≥4.5:1，控件边界/焦点 ≥3:1）。
 * - 字号：全部 rem（`htmlFontSize` 16 / `html { font-size: 100% }`），用户改浏览器字号即可整体放大。
 * - 触摸：`@media (pointer: coarse)` 下按钮/图标按钮/菜单项 ≥44px；桌面保持更紧凑的密度。
 * - 动效：`prefers-reduced-motion: reduce` 时关闭位移与循环动画，但保留颜色/透明度等状态反馈。
 */

import { createTheme, type Theme } from "@mui/material/styles";

const fontStack = [
  "-apple-system",
  "BlinkMacSystemFont",
  '"Segoe UI"',
  '"PingFang SC"',
  '"Hiragino Sans GB"',
  '"Microsoft YaHei"',
  '"Noto Sans SC"',
  "Roboto",
  "sans-serif",
].join(",");

/** 浅色令牌：注释里的比值为实测计算值（对白卡片 / 对页面底 / 对软底色）。 */
const lightPalette = {
  primary: {
    main: "#2F6DF6", // 品牌色；白字于其上 4.53:1（按钮）
    dark: "#1E4FCB", // 软底上的文字；对 #E8EFFF 6.00:1、对白 6.92:1
    light: "#E8EFFF",
    contrastText: "#FFFFFF",
  },
  error: {
    main: "#B3261E", // 对白 6.54:1；白字于其上 6.54:1
    dark: "#8C1B16",
    light: "#FDECEA",
    contrastText: "#FFFFFF",
  },
  warning: {
    main: "#8A5606", // 对白 6.15:1；对软底 #F7EDDD 5.31:1
    dark: "#6E4404",
    light: "#F7EDDD",
    contrastText: "#FFFFFF",
  },
  success: {
    main: "#0F7A57", // 对白 5.33:1
    dark: "#0B5C41",
    light: "#E4F5EE",
    contrastText: "#FFFFFF",
  },
  info: {
    main: "#0B6BCB", // 对白 5.28:1
    dark: "#0A5BB0",
    light: "#E7F0FB",
    contrastText: "#FFFFFF",
  },
  background: { default: "#F4F6FB", paper: "#FFFFFF" },
  text: { primary: "#1B2231", secondary: "#5C6579" }, // 正文 15.9:1 / 次要 5.85:1
  divider: "#D7DEEA",
  mode: "light" as const,
};

/** 深色令牌。 */
const darkPalette = {
  primary: {
    main: "#8AB4FF", // 对卡片 8.25:1、对页面底 8.98:1；深墨字于其上 9.19:1
    dark: "#B9D2FF",
    light: "#1C2740",
    contrastText: "#0B0F16",
  },
  error: {
    main: "#FF8A85", // 深墨字于其上 7.36:1（修掉旧版 #fff 只有 2.84:1 的问题）
    dark: "#FFB4B0",
    light: "#3A1D1C",
    contrastText: "#3A0F0D",
  },
  warning: {
    main: "#F0B95C", // 对卡片 9.68:1
    dark: "#FFD08A",
    light: "#3A2E17",
    contrastText: "#3A2405",
  },
  success: {
    main: "#5FD3A3", // 对卡片 9.4:1（估算）
    dark: "#8FE4BE",
    light: "#12372A",
    contrastText: "#06231A",
  },
  info: {
    main: "#7CC0FF",
    dark: "#A9D8FF",
    light: "#12293F",
    contrastText: "#0B1220",
  },
  background: { default: "#0F1218", paper: "#171B24" },
  text: { primary: "#E9EDF6", secondary: "#A8B2C6" }, // 正文 14.7:1 / 次要 8.08:1
  divider: "#2A3242",
  mode: "dark" as const,
};

export const theme: Theme = createTheme({
  colorSchemes: {
    light: { palette: lightPalette },
    dark: { palette: darkPalette },
  },
  typography: {
    fontFamily: fontStack,
    htmlFontSize: 16,
    fontSize: 16,
    h1: { fontSize: "1.375rem", fontWeight: 700, lineHeight: 1.3 },
    h2: { fontSize: "1.125rem", fontWeight: 650, lineHeight: 1.35 },
    h3: { fontSize: "1rem", fontWeight: 650, lineHeight: 1.4 },
    body1: { fontSize: "1rem", lineHeight: 1.6 },
    body2: { fontSize: "0.875rem", lineHeight: 1.55 },
    caption: { fontSize: "0.8125rem", lineHeight: 1.45 },
    button: { fontSize: "0.9375rem", fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiCssBaseline: {
      styleOverrides: (themeParam: Theme) => ({
        html: { fontSize: "100%" },
        body: {
          fontFamily: fontStack,
          // 浏览器自带表面也归设计系统（选区、光标、滚动条）
          caretColor: themeParam.palette.primary.main,
        },
        "::selection": {
          backgroundColor: themeParam.palette.text.primary,
          color: themeParam.palette.background.paper,
        },
        "*": {
          scrollbarWidth: "thin",
          scrollbarColor: `${themeParam.palette.text.secondary} transparent`,
        },
        "@media (prefers-reduced-motion: reduce)": {
          "*, *::before, *::after": {
            animationDuration: "0.01ms !important",
            animationIterationCount: "1 !important",
            transitionDuration: "0.01ms !important",
            scrollBehavior: "auto !important",
          },
        },
      }),
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: 40,
          borderRadius: 10,
          textTransform: "none",
          paddingInline: 16,
          "@media (pointer: coarse)": { minHeight: 44 },
        },
        sizeSmall: {
          minHeight: 36,
          paddingInline: 12,
          "@media (pointer: coarse)": { minHeight: 44 },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          width: 40,
          height: 40,
          borderRadius: 10,
          "@media (pointer: coarse)": { width: 44, height: 44 },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          height: 36,
          borderRadius: 999,
          fontWeight: 600,
          "@media (pointer: coarse)": { height: 44 },
        },
        deleteIcon: {
          // 删除一个节点是不可逆操作：把可点区域从 MUI 默认的裸 SVG（约 20px）放大到约 38px
          fontSize: 22,
          padding: 8,
          margin: "0 -6px 0 2px",
          borderRadius: "50%",
          boxSizing: "content-box",
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: { minHeight: 48 },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        notchedOutline: ({ theme: t }) => ({
          // 输入框边界需要 ≥3:1 的非文本对比（WCAG 1.4.11）：浅 4.55 / 深 3.87
          borderColor: t.palette.mode === "dark" ? "#6B7891" : "#6B7788",
        }),
      },
    },
    MuiTextField: {
      defaultProps: { variant: "outlined", size: "medium" },
    },
    MuiCard: {
      defaultProps: { variant: "outlined" },
      styleOverrides: { root: { borderRadius: 14 } },
    },
    MuiCardContent: {
      styleOverrides: { root: { padding: 14, "&:last-child": { paddingBottom: 14 } } },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: 16 } },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 12, alignItems: "center" } },
    },
    MuiSnackbar: {
      defaultProps: { anchorOrigin: { vertical: "bottom", horizontal: "center" } },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { height: 8, borderRadius: 999 },
        bar: { borderRadius: 999 },
      },
    },
    MuiBottomNavigation: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          height: 62,
          backgroundColor: t.palette.background.paper,
          borderTop: `1px solid ${t.palette.divider}`,
        }),
      },
    },
    MuiBottomNavigationAction: {
      styleOverrides: {
        root: { minWidth: 56, paddingTop: 8 },
        label: { fontSize: "0.8125rem" },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: { minHeight: 44, textTransform: "none", fontWeight: 600 },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: { borderRadius: 10, "@media (pointer: coarse)": { minHeight: 48 } },
      },
    },
    MuiMenuItem: {
      styleOverrides: { root: { minHeight: 44 } },
    },
    MuiToolbar: {
      styleOverrides: { root: { minHeight: 56, paddingInline: 14 } },
    },
  },
});
