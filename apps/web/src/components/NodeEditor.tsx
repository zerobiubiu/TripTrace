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
import { radius } from "../theme";
import type { NodeDraft } from "../lib/entry";

/** 中文朗读与提示：dnd-kit 自带的是英文，屏幕阅读器用户听到的应该是产品自己的语言。 */
const SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable: "按空格或回车拿起节点，用上下方向键移动，再按空格或回车放下，按 Esc 取消。",
};

interface NodeEditorProps {
  nodes: NodeDraft[];
  /** 保存被拦下后才显示「填节点名」——不在用户刚开始输入时就报错 */
  showEmptyError: boolean;
  onRename: (nodeId: string, name: string) => void;
  onRemove: (nodeId: string) => void;
  onMove: (nodeId: string, toIndex: number) => void;
}

/**
 * 路线节点编辑区：每个节点一行，**行内直接改名**，左侧手柄拖动排序。
 *
 * 拖动只挂在手柄上（`useSortable` 的 listeners 只给 IconButton），所以点进输入框编辑
 * 永远不会触发拖拽；键盘走 KeyboardSensor：空格/回车拿起 → 方向键移动 → 空格放下。
 */
export function NodeEditor({ nodes, showEmptyError, onRename, onRemove, onMove }: NodeEditorProps) {
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
        ? `节点「${nameOf(active.id)}」放到了第 ${positionOf(over.id) + 1} 站，路线与分段已按新顺序重算。`
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
            <SortableNodeRow
              key={node.id}
              node={node}
              position={nodeIndex}
              showEmptyError={showEmptyError}
              onRename={onRename}
              onRemove={onRemove}
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

interface SortableNodeRowProps {
  node: NodeDraft;
  position: number;
  showEmptyError: boolean;
  onRename: (nodeId: string, name: string) => void;
  onRemove: (nodeId: string) => void;
}

function SortableNodeRow({ node, position, showEmptyError, onRename, onRemove }: SortableNodeRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id });
  const empty = showEmptyError && !node.name.trim();

  return (
    <Stack
      ref={setNodeRef}
      direction="row"
      spacing={0.5}
      sx={{
        alignItems: "center",
        p: 1,
        borderRadius: radius.control,
        bgcolor: "action.hover",
        opacity: isDragging ? 0.4 : 1,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
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

      <TextField
        value={node.name}
        onChange={(event) => onRename(node.id, event.target.value)}
        error={empty}
        helperText={empty ? "填节点名" : undefined}
        slotProps={{ htmlInput: { "aria-label": `第 ${position + 1} 站的节点名称`, maxLength: 40 } }}
        sx={{ flex: 1, minWidth: 0 }}
      />

      <IconButton
        aria-label={`移除节点 ${node.name || `第 ${position + 1} 站`}`}
        onClick={() => onRemove(node.id)}
        sx={{ color: "text.secondary" }}
      >
        <CancelRoundedIcon />
      </IconButton>
    </Stack>
  );
}