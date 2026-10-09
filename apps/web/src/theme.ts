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

/**
 * 形状令牌（shape tokens）：整站的圆角只说这几个数，组件不再各写各的。
 *
 * 原则是**曲率一致，而不是半径相等**：半径随「层的大小」递增（图标 → 控件 → 字段 → 内容 → 浮层），
 * 但所有层级共享同一条曲线族（见下方 `squircleCorners`）。嵌套时内层不超过外层，
 * 紧贴外层的（菜单项、自动完成选项）按 `外层 − 内边距` 取同心值。
 *
 * 档位为什么取这一组数（定档后按「看着偏小」上调过一版）：超椭圆曲线下**同半径的角看起来比圆弧更小**，
 * Apple 的连续圆角要放大 1.2–1.5 倍才与圆弧等感；这组值按**感知半径**定
 * （按钮 14/40px ≈ 35%、字段 16/48px ≈ 33%、卡片 20px、浮层 22px），与 iOS 的连续圆角区间相符。
 *
 * ⚠️ `sx` 里的 `borderRadius: <number>` 会被 MUI 乘上 `shape.borderRadius`——
 * 所以视图里要用这份**字符串**令牌（`radius.control`），theme 的 styleOverrides 里才用数字。
 */
export const radius = {
  /** 品牌图标（26 / 30px 的小方块）：约 38%，接近系统图标的超椭圆比例 */
  icon: "10px",
  /** 嵌在浮层里的项（菜单项、自动完成选项）与提示气泡：浮层 22 − 内边距 10 = 同心 12px */
  inner: "12px",
  /** 控件：按钮、图标按钮、列表行、卡片里的软色块行、节点行 */
  control: "14px",
  /** 字段与提示条：输入框、Alert、Snackbar、Skeleton */
  field: "16px",
  /** 内容面：卡片、表格容器 */
  content: "20px",
  /** 浮层：对话框、菜单 / Popover / 自动完成的纸面、抽屉 */
  floating: "22px",
  /** 胶囊与进度条 */
  pill: "999px",
} as const;

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
    caption: { fontSize: "0.875rem", lineHeight: 1.45 },
    button: { fontSize: "0.9375rem", fontWeight: 600 },
  },
  shape: { borderRadius: 14 }, // 兜底值（= radius.control）：未被显式覆盖的 MUI 结构落在中间档
  // 断点词汇：本项目只认三条线——sm 600（大屏手机）、md 900（平板横屏起）、**lg 1024＝桌面形态**。
  // MUI 默认 lg 是 1200，会让 1024–1199 的笔记本停在「平板形态」里，与 app.css 的 1024 两栏判定不一致；
  // 因此把 lg 收到 1024，让 JS（useMediaQuery）与 CSS（@media min-width）说同一件事。
  breakpoints: { values: { xs: 0, sm: 600, md: 900, lg: 1024, xl: 1536 } },
  components: {
    // 下面各处的 borderRadius 数字就是 `radius` 令牌的字面值：theme 的 styleOverrides 不做乘法
    // （`sx` 里的数字会被乘上 shape.borderRadius，所以视图要用字符串令牌，别在这里踩坑）。
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
        // 连续曲率（continuous curvature / 超椭圆）：`border-radius` 画的是圆弧，两段弧与直边之间只有 G1
        // 接续；Apple 那种连续曲率是超椭圆（G2）。这里不是「把圆角改大」——**半径完全由上面的令牌决定**，
        // 只是在支持的浏览器上把同一半径的角换成超椭圆曲线（MDN：`squircle` ≡ `superellipse(2)`，
        // 曲线 x^2K + y^2K = 1；K=2 比圆弧更「满」，K=2.5 更接近 Apple 的五次超椭圆）。
        //
        // 支持面（MDN BCD 实测）：Chrome / Edge 139+ 已支持；Safari 与 Firefox 目前仅在预览版里。
        // 所以这是**纯增强**：不支持的浏览器继续画圆弧，半径与层级关系完全一致，布局、状态、焦点环
        // 都不依赖它（MDN：边框、外轮廓、阴影、背景、overflow 会跟随角形，所以边框与外轮廓自动同形）。
        // 提升面 100%：一处声明覆盖全站（含 MUI 内部结构与以后新加的组件），组件不必各写一份。
        "@supports (corner-shape: squircle)": {
          "*, *::before, *::after": { cornerShape: "squircle" },
          // 例外：正圆与胶囊保持真圆——超椭圆会把端帽改形，Apple 也保留正圆头像与胶囊芯片
          ".MuiChip-root, .MuiChip-deleteIcon, .MuiLinearProgress-root, .MuiLinearProgress-bar, .MuiAvatar-root, .MuiBadge-badge":
            { cornerShape: "round" },
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
    MuiButtonBase: {
      styleOverrides: {
        // 键盘焦点必须看得见：统一 2px 主色描边（≥3:1），鼠标操作不触发
        root: ({ theme: t }) => ({
          "&.Mui-focusVisible": {
            outline: `2px solid ${t.palette.primary.dark}`,
            outlineOffset: 2,
          },
        }),
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: 40,
          borderRadius: 14, // 控件层（radius.control）
          textTransform: "none",
          paddingInline: 16,
          "@media (pointer: coarse)": { minHeight: 44 },
        },
        sizeSmall: {
          minHeight: 36,
          borderRadius: 12,
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
          borderRadius: 14, // 控件层
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
        label: {
          // MUI 默认 13px（size=small 时 12px）：低于 14px 下限，统一抬到 body2
          fontSize: "0.875rem",
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
        root: { borderRadius: 16 }, // 字段层（radius.field）
        notchedOutline: ({ theme: t }) => ({
          // 输入框边界需要 ≥3:1 的非文本对比（WCAG 1.4.11）：浅 4.55 / 深 3.87
          borderColor: t.palette.mode === "dark" ? "#6B7891" : "#6B7788",
        }),
      },
    },
    MuiTextField: {
      defaultProps: { variant: "outlined", size: "medium" },
    },
    MuiInputLabel: {
      styleOverrides: {
        // 标签两种状态都显式指定：静止 16px、收缩 14px（MUI 收缩态是 16px × scale(0.75) = 12px，低于下限）
        root: {
          fontSize: "1rem",
          "&.MuiInputLabel-shrink": {
            fontSize: "0.875rem",
            transform: "translate(14px, -9px) scale(1)",
          },
        },
      },
    },
    MuiFormHelperText: {
      styleOverrides: {
        // MUI 默认 13px；说明/错误文案也要读得清
        root: { fontSize: "0.875rem" },
      },
    },
    // 浮层纸面：只在真正的浮层组件上声明 22px（radius.floating）。
    // 不再广谱覆盖 `MuiPaper`——它的选择器（`.MuiPaper-root.MuiPaper-rounded`）会压过
    // `MuiCard.root`（同为 styleOverrides，但 Paper 那条多一个类），把卡片顶成浮层圆角（0.9.1 实测踩到过）。
    // 约束：以后新加的浮层要自己点一下 `radius.floating`。
    MuiPopover: {
      styleOverrides: { paper: { borderRadius: 22 } },
    },
    MuiDrawer: {
      styleOverrides: { paper: { borderRadius: 22 } },
    },
    MuiAppBar: {
      // 整宽的顶部 chrome 不属于任何一层浮层：直角贴边
      styleOverrides: { root: { borderRadius: 0 } },
    },
    MuiCard: {
      defaultProps: { variant: "outlined" },
      styleOverrides: { root: { borderRadius: 20 } }, // 内容层
    },
    MuiCardContent: {
      styleOverrides: { root: { padding: 14, "&:last-child": { paddingBottom: 14 } } },
    },
    MuiTableContainer: {
      styleOverrides: { root: { borderRadius: 20 } }, // 内容层：表格与卡片同层
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: 22 } }, // 浮层层
    },
    MuiMenu: {
      styleOverrides: {
        paper: { borderRadius: 22 },
        // 菜单项原本贴边（inset 0），圆角纸面下首/末项的圆角会探出纸面曲线；
        // 让列表内边距等于「纸面 − 项」= 10px，嵌套圆角因此同心（菜单、下拉选择同一处生效）
        list: { padding: 10 },
      },
    },
    MuiMenuItem: {
      // 菜单项：纸面 22 − 内边距 10 = 同心 12px（radius.inner）
      styleOverrides: { root: { minHeight: 44, borderRadius: 12 } },
    },
    MuiAutocomplete: {
      styleOverrides: {
        // 同理：选项贴边会让首/末项圆角探出弹层曲线
        paper: { borderRadius: 22, padding: 10 },
        option: { borderRadius: 12 },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { borderRadius: 10, fontSize: "0.875rem", padding: "6px 10px" }, // 小浮层：图标档
      },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 16, alignItems: "center" } }, // 字段层
    },
    MuiSnackbar: {
      defaultProps: { anchorOrigin: { vertical: "bottom", horizontal: "center" } },
      styleOverrides: { root: { "& .MuiPaper-root": { borderRadius: 16 } } },
    },
    MuiSkeleton: {
      styleOverrides: { root: { borderRadius: 16 } },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { height: 8, borderRadius: 999 },
        bar: { borderRadius: 999 },
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: { root: { borderRadius: 14 } }, // 控件层
    },
    MuiToggleButton: {
      styleOverrides: {
        root: { minHeight: 44, borderRadius: 14, textTransform: "none", fontWeight: 600 },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: { borderRadius: 14, "@media (pointer: coarse)": { minHeight: 48 } }, // 控件层
      },
    },
    MuiToolbar: {
      styleOverrides: { root: { minHeight: 56, paddingInline: 14 } },
    },
  },
});
