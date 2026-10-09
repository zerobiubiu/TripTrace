import { useEffect, useState } from "react";
import { Box } from "@mui/material";

interface AvatarBadgeProps {
  displayName: string;
  /** 头像版本（ISO）；非空才去取图。 */
  avatarUpdatedAt: string | null;
  /** 直径（px）。 */
  size: number;
}

/**
 * 头像：有自定义头像时取 `/api/me/avatar?v=<版本>`（私有长缓存，换图即 URL 变化）；
 * 没有（或图片加载失败）时用显示名首字生成默认头像——国道蓝软底 + 主色深字，圆形。
 */
export function AvatarBadge({ displayName, avatarUpdatedAt, size }: AvatarBadgeProps) {
  const [failed, setFailed] = useState(false);

  // 换了头像（版本变化）后要重新尝试加载
  useEffect(() => setFailed(false), [avatarUpdatedAt]);

  const initial = [...displayName.trim()][0] ?? "途";
  const showImage = Boolean(avatarUpdatedAt) && !failed;

  return (
    <Box
      sx={{
        width: size,
        height: size,
        flex: "0 0 auto",
        borderRadius: "50%",
        overflow: "hidden",
        display: "grid",
        placeItems: "center",
        bgcolor: "primary.light",
        color: "primary.dark",
        fontWeight: 650,
        lineHeight: 1,
        // 字号取直径的 42%，但不低于全站 14px 地板
        fontSize: Math.max(14, Math.round(size * 0.42)),
        userSelect: "none",
      }}
      aria-hidden="true"
    >
      {showImage ? (
        <Box
          component="img"
          src={`/api/me/avatar?v=${encodeURIComponent(avatarUpdatedAt ?? "")}`}
          alt=""
          width={size}
          height={size}
          onError={() => setFailed(true)}
          sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        initial
      )}
    </Box>
  );
}