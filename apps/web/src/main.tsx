import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { App } from "./App";
import { theme } from "./theme";
import "./app.css";

const container = document.getElementById("root");
if (!container) throw new Error("缺少 #root 容器");

createRoot(container).render(
  <StrictMode>
    {/* noSsr：纯 SPA，避免亮/暗双渲染与刷新闪烁；disableTransitionOnChange：切换配色时不做过渡 */}
    <ThemeProvider theme={theme} noSsr disableTransitionOnChange>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
);
