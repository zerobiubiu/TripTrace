/**
 * 表单草稿的本地持久化（localStorage）。
 *
 * 目的：401 被踢出、误点清空、或标签页被系统回收时，用户在路上敲出来的整条节点链不会凭空消失。
 * 只在表单非空时写入；登录成功后由 App 决定是恢复还是丢弃。
 */

import type { EntryForm } from "./entry";

export interface StoredDraft {
  date: string;
  nodes: string[];
  legs: string[];
  note: string;
  savedAt: string;
}

function storageKey(userId: string): string {
  return `triptrace:draft:${userId}`;
}

/** 旧版本草稿（含 total/totalManual 等多余字段）同样通过校验：只取需要的那几个字段。 */
function isStoredDraft(value: unknown): value is StoredDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Record<string, unknown>;
  return (
    typeof draft.date === "string" &&
    Array.isArray(draft.nodes) &&
    Array.isArray(draft.legs) &&
    typeof draft.note === "string"
  );
}

export function loadDraft(userId: string): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** 表单为空（没有节点、没有备注）时不落盘，避免每次打开都恢复一份空草稿。 */
export function saveDraft(userId: string, form: EntryForm): void {
  const isEmpty = form.nodes.length === 0 && !form.note.trim();
  if (isEmpty) {
    clearDraft(userId);
    return;
  }
  const draft: StoredDraft = {
    date: form.date,
    nodes: form.nodes,
    legs: form.legs,
    note: form.note,
    savedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(draft));
  } catch {
    // 隐私模式/配额满：草稿功能失效不应影响主流程
  }
}

export function clearDraft(userId: string): void {
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    // 同上
  }
}

export function draftToForm(draft: StoredDraft): EntryForm {
  return {
    date: draft.date,
    nodes: [...draft.nodes],
    legs: [...draft.legs],
    note: draft.note,
    editingId: null,
  };
}

export function draftSummary(draft: StoredDraft): string {
  const chain = draft.nodes.length > 0 ? draft.nodes.join(" → ") : "（未填节点）";
  return `${draft.date} · ${chain}`;
}
