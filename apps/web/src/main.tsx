import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { zhCN } from "@mui/x-date-pickers/locales";
import "dayjs/locale/zh-cn";
import { App } from "./App";
import { theme } from "./theme";
import "./app.css";

// 旧地址（*.workers.dev）统一跳到正式域名：同一个 Worker 两个主机名会有两套 Cookie，
// 否则用户会在旧地址上「看不到自己的登录态」。正式域名为构建期常量（vite define）。
const jumpToCanonical = (() => {
  try {
    const canonical = new URL(__CANONICAL_URL__);
    if (location.hostname.endsWith(".workers.dev") && location.hostname !== canonical.hostname) {
      location.replace(`${canonical.origin}${location.pathname}${location.search}${location.hash}`);
      return true;
    }
  } catch {
    // 粗心的常量配置不该拖垮应用：跳转失败就继续正常渲染
  }
  return false;
})();

const container = document.getElementById("root");
if (!container) throw new Error("缺少 #root 容器");

if (!jumpToCanonical) {
  createRoot(container).render(
    <StrictMode>
      {/* 日期控件统一走 @mui/x-date-pickers（dayjs 适配器 + 中文文案） */}
      <LocalizationProvider
        dateAdapter={AdapterDayjs}
        adapterLocale="zh-cn"
        localeText={zhCN.components.MuiLocalizationProvider.defaultProps.localeText}
      >
        {/* noSsr：纯 SPA，避免亮/暗双渲染与刷新闪烁；disableTransitionOnChange：切换配色时不做过渡 */}
        <ThemeProvider theme={theme} noSsr disableTransitionOnChange>
          <CssBaseline />
          <App />
        </ThemeProvider>
      </LocalizationProvider>
    </StrictMode>,
  );
}
