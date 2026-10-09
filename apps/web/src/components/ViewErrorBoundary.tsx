import { Component, type ErrorInfo, type ReactNode } from "react";
import { Box, type SxProps, type Theme } from "@mui/material";
import { Notice } from "./Notice";

interface ViewErrorBoundaryProps {
  children: ReactNode;
  /** 重试时调用：重置边界并重新拉取数据（由 App 传入）。 */
  onRetry: () => void;
  /** 布局透传（把原来包在视图外面的容器的 sx 交给这一层，避免多包一层 Box）。 */
  sx?: SxProps<Theme>;
}

interface ViewErrorBoundaryState {
  error: Error | null;
}

/**
 * 视图错误边界：任何一页在渲染期抛错都不能带走整站——否则用户看到的是**白屏**且没有任何出路。
 *
 * 这里是最后一道网：正常情况下应该在边界处（`api.ts`）把服务端返回值洗成合法形状，
 * 让界面只是少一条记录。真出了意外时，这一层保证还能继续用别的分组、还能重试。
 */
export class ViewErrorBoundary extends Component<ViewErrorBoundaryProps, ViewErrorBoundaryState> {
  state: ViewErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ViewErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 出错要留痕（这是排查线索，不是调试输出）：控制台里能对上具体组件栈
    console.error("[途迹] 视图渲染失败", error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ error: null });
    this.props.onRetry();
  };

  render() {
    if (!this.state.error) {
      return (
        <Box sx={this.props.sx}>
          {this.props.children}
        </Box>
      );
    }
    return (
      <Box sx={this.props.sx}>
        <Notice severity="error" action={{ label: "重试", run: this.handleRetry }}>
          这一页暂时打不开。可以点「重试」重新载入记录；如果反复出现，刷新页面后把发生的情况告诉我们。
        </Notice>
      </Box>
    );
  }
}