import { useState } from "react";
import { IconButton, Stack, TextField, Typography } from "@mui/material";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import DragIndicatorRoundedIcon from "@mui/icons-material/DragIndicatorRounded";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { NodeNameField } from "./NodeNameField";
import { radius } from "../theme";
import type { NodeDraft } from "../lib/entry";

/** 中文朗读与提示：dnd-kit 自带的是英文，屏幕阅读器用户听到的应该是产品自己的语言。 */
const SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable: "按空格或回车拿起节点，用上下方向键移动，再按空格或回车放下，按 Esc 取消。",
};

interface RouteEditorProps {
  nodes: NodeDraft[];
  /** 分段里程文本，`legs[i]` 是 nodes[i] → nodes[i+1] 的那一段（顺序即路线） */
  legs: string[];
  /** 保存被拦下后才显示「填节点名」——不在用户刚开始输入时就报错 */
  showEmptyError: boolean;
  legIssues: { invalidLegIndexes: number[]; missingLegIndexes: number[] };
  /** 某节点位的候选（父层按「匹配 + 使用频率」算好，顺序与路线顺序无关） */
  optionsFor: (position: number, query: string) => string[];
  onRename: (nodeId: string, name: string) => void;
  onRemove: (nodeId: string) => void;
  onMove: (nodeId: string, toIndex: number) => void;
  onLegChange: (legIndex: number, value: string) => void;
}

/**
 * 路线编辑区：**节点与分段里程是一个连续的整体**，不再是两个独立区域。
 *
 * 一行 = 节点（手柄 + 站号 + 节点名控件 + 移除）；该行下方紧接「到下一站的里程」输入条——
 * 于是从上到下读就是 家 → 25 → 圣润 → 12 → 天九，顺序即路线。
 *
 * 数据只有一份（`nodes` + `legs`，见 `lib/entry.ts`）：分段永远按**相邻端点对**派生，
 * 拖动/增删后由 `legsForNodes` 重建，所以「里程跟着路段走」，不会错位。
 */
export function RouteEditor({
  nodes,
  legs,
  showEmptyError,
  legIssues,
  optionsFor,
  onRename,
  onRemove,
  onMove,
  onLegChange,
}: RouteEditorProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const sensors = useSensors(
    // 4px 以内不算拖动：单手点手柄想要聚焦/轻触时不会误拖动
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const nameOf = (id: string | number) => nodes.find((node) => node.id === id)?.name || "（未命名）";
  const positionOf = (id: string | number) => nodes.findIndex((node) => node.id === id);

  const announcements: Announcements = {
    onDragStart: ({ active }) => `已拿起节点「${nameOf(active.id)}」，当前第 ${positionOf(active.id) + 1} 站。`,
    onDragOver: ({ active, over }) =>
      over
        ? `节点「${nameOf(active.id)}」移到第 ${positionOf(over.id) + 1} 站。`
        : `节点「${nameOf(active.id)}」不在列表上。`,
    onDragEnd: ({ active, over }) =>
      over
        ? `节点「${nameOf(active.id)}」放到了第 ${positionOf(over.id) + 1} 站，分段里程已按新顺序重算。`
        : `节点「${nameOf(active.id)}」已放回原位。`,
    onDragCancel: ({ active }) => `已取消移动节点「${nameOf(active.id)}」。`,
  };

  const handleDragStart = ({ active }: DragStartEvent) => setDraggingId(String(active.id));
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDraggingId(null);
    if (!over || active.id === over.id) return;
    const toIndex = positionOf(over.id);
    if (toIndex >= 0) onMove(String(active.id), toIndex);
  };

  const activeIndex = draggingId ? positionOf(draggingId) : -1;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      accessibility={{ announcements, screenReaderInstructions: SCREEN_READER_INSTRUCTIONS }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingId(null)}
    >
      <SortableContext items={nodes.map((node) => node.id)} strategy={verticalListSortingStrategy}>
        <Stack spacing={1}>
          {nodes.map((node, nodeIndex) => (
            <SortableRouteRow
              key={node.id}
              node={node}
              position={nodeIndex}
              next={nodes[nodeIndex + 1] ?? null}
              leg={legs[nodeIndex] ?? ""}
              legInvalid={legIssues.invalidLegIndexes.includes(nodeIndex)}
              legMissing={showEmptyError && legIssues.missingLegIndexes.includes(nodeIndex)}
              showEmptyError={showEmptyError}
              optionsFor={optionsFor}
              onRename={onRename}
              onRemove={onRemove}
              onLegChange={onLegChange}
            />
          ))}
        </Stack>
      </SortableContext>

      {/* 拖动中的浮层：只有真的浮在内容之上时才用阴影（设计系统的深度立场） */}
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {draggingId ? (
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: "center",
              p: 1,
              borderRadius: radius.control,
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "primary.main",
              boxShadow: 8,
            }}
          >
            <DragIndicatorRoundedIcon sx={{ color: "text.secondary" }} />
            <Typography variant="body2" sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums" }}>
              {activeIndex + 1}
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {nameOf(draggingId)}
            </Typography>
          </Stack>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface SortableRouteRowProps {
  node: NodeDraft;
  position: number;
  next: NodeDraft | null;
  leg: string;
  legInvalid: boolean;
  legMissing: boolean;
  showEmptyError: boolean;
  optionsFor: (position: number, query: string) => string[];
  onRename: (nodeId: string, name: string) => void;
  onRemove: (nodeId: string) => void;
  onLegChange: (legIndex: number, value: string) => void;
}

/** 一行 = 一个节点 + （若有下一站）到下一站的分段里程。 */
function SortableRouteRow({
  node,
  position,
  next,
  leg,
  legInvalid,
  legMissing,
  showEmptyError,
  optionsFor,
  onRename,
  onRemove,
  onLegChange,
}: SortableRouteRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id });
  const empty = showEmptyError && !node.name.trim();

  return (
    <Stack
      ref={setNodeRef}
      sx={{
        p: 1,
        borderRadius: radius.control,
        bgcolor: "action.hover",
        opacity: isDragging ? 0.4 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
        <IconButton
          {...attributes}
          {...listeners}
          aria-label={`拖动排序：第 ${position + 1} 站 ${node.name || "（未命名）"}`}
          sx={{
            cursor: "grab",
            color: "text.secondary",
            // 触屏拖动必须吃掉浏览器自己的滚动/手势，否则手柄一动页面就跟着滚
            touchAction: "none",
            "&:active": { cursor: "grabbing" },
          }}
        >
          <DragIndicatorRoundedIcon />
        </IconButton>

        <Typography
          variant="body2"
          aria-hidden
          sx={{ color: "text.secondary", minWidth: "1.25rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}
        >
          {position + 1}
        </Typography>

        <NodeNameField
          value={node.name}
          optionsFor={(query) => optionsFor(position, query)}
          ariaLabel={`第 ${position + 1} 站的节点名称`}
          placeholder="输入节点名"
          error={empty}
          helperText={empty ? "填节点名" : undefined}
          onValueChange={(name) => onRename(node.id, name)}
        />

        <IconButton
          aria-label={`移除节点 ${node.name || `第 ${position + 1} 站`}`}
          onClick={() => onRemove(node.id)}
          sx={{ color: "text.secondary" }}
        >
          <CancelRoundedIcon />
        </IconButton>
      </Stack>

      {next ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", pl: 5, mt: 0.75 }}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0, color: "text.secondary", overflowWrap: "anywhere" }}>
            {node.name || "（未命名）"} → {next.name || "（未命名）"}
          </Typography>
          <TextField
            size="small"
            value={leg}
            error={legInvalid || legMissing}
            helperText={legInvalid ? "不合规" : legMissing ? "必填" : undefined}
            slotProps={{
              htmlInput: {
                inputMode: "decimal",
                "aria-label": `${node.name} 到 ${next.name} 的里程`,
              },
            }}
            onChange={(event) => onLegChange(position, event.target.value)}
            sx={{ width: 124 }}
          />
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            公里
          </Typography>
        </Stack>
      ) : null}
    </Stack>
  );
}