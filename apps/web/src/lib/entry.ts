/**
 * 填报表单的纯函数逻辑：节点链 + 分段里程。
 *
 * 规则（0.5.0 起）：**每一段里程都必须填**，否则不允许保存；总里程由分段合计得出，不再手填。
 * 每段默认带出历史值：整条历史路线优先，其次同路段（含反方向——同一条路往返里程相同）。
 *
 * 节点身份（0.9.0 起）：每个节点是 `{ id, name }`，**认节点一律用 id，不用数组下标**——
 * 拖动重排后下标会整体错位，用下标当身份会让“删掉的那个”和“该删的那个”不是同一个。
 * `legs[i]` 始终是 `nodes[i] → nodes[i+1]` 的里程文本：**顺序是路线的唯一依据**，重排后按新顺序重算。
 */

import type { Trip, TripPayload } from "../types";
import { formatKm, kmState, normalizeName, parseKmInput, todayIso } from "./format";
import { findRoute, nameKey, suggestLegKm, type LegSuggestion, type SuggestIndex } from "./suggest";

export interface NodeDraft {
  id: string;
  name: string;
}

export interface EntryForm {
  date: string;
  nodes: NodeDraft[];
  legs: string[];
  note: string;
  editingId: string | null;
}

/** 稳定的节点身份：拖动排序、增删、编辑都用它配对（随机 UUID，不与位置绑定）。 */
export function newNodeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 节点名列表：给建议引擎（`suggest.ts` 只认字符串数组）用。 */
export function nodeNames(form: EntryForm): string[] {
  return form.nodes.map((node) => node.name);
}

export function createEntryForm(date = todayIso()): EntryForm {
  return {
    date,
    nodes: [],
    legs: [],
    note: "",
    editingId: null,
  };
}

export function legsSum(legs: string[]): { sum: number; any: boolean } {
  let sum = 0;
  let any = false;
  for (const value of legs) {
    const km = parseKmInput(value);
    if (km === null) continue;
    sum += km;
    any = true;
  }
  return { sum: Math.round(sum * 100) / 100, any };
}

/** 某分段的历史默认值：整条历史路线优先，其次同路段（含反方向）。 */
export function legSuggestion(
  index: SuggestIndex | null,
  form: EntryForm,
  legIndex: number,
): LegSuggestion | null {
  const route = findRoute(index, nodeNames(form));
  const routeKm = route?.legs[legIndex]?.km;
  if (routeKm !== null && routeKm !== undefined) {
    return { km: routeKm, count: route?.count ?? 1, lastDate: route?.date ?? "" };
  }
  return suggestLegKm(
    index,
    form.nodes[legIndex]?.name ?? "",
    form.nodes[legIndex + 1]?.name ?? "",
  );
}

/** 用历史值补齐空白分段；`force` 为真时连已填的也覆盖（用于一键沿用历史链）。 */
function withLegDefaults(form: EntryForm, index: SuggestIndex | null, force: boolean): EntryForm {
  const legs = form.legs.map((value, legIndex) => {
    if (!force && value.trim()) return value;
    const suggestion = legSuggestion(index, form, legIndex);
    return suggestion ? formatKm(suggestion.km) : value;
  });
  return { ...form, legs };
}

/**
 * 节点列表结构变化后**按新顺序重建分段**（新增/删除/拖动三种情况共用这一条规则）：
 * 仍然相邻的端点对按先后顺序取用原值（同一条路出现多次时依次对应），
 * 新出现的相邻对留空——绝不让某个数字留在它没填过的路段上；空位随后由历史默认值补齐。
 */
function legsForNodes(nodes: NodeDraft[], previousNodes: NodeDraft[], previousLegs: string[]): string[] {
  const pending = new Map<string, string[]>();
  previousLegs.forEach((value, legIndex) => {
    const a = previousNodes[legIndex]?.name;
    const b = previousNodes[legIndex + 1]?.name;
    if (a === undefined || b === undefined || !value.trim()) return;
    const key = pairKey(a, b);
    pending.set(key, [...(pending.get(key) ?? []), value]);
  });

  const legs: string[] = [];
  for (let legIndex = 0; legIndex + 1 < nodes.length; legIndex += 1) {
    const a = nodes[legIndex];
    const b = nodes[legIndex + 1];
    if (!a || !b) continue;
    const queue = pending.get(pairKey(a.name, b.name));
    legs.push(queue && queue.length > 0 ? queue.shift() ?? "" : "");
  }
  return legs;
}

export function withNodeAdded(form: EntryForm, rawName: string, index: SuggestIndex | null): EntryForm {
  const name = normalizeName(rawName);
  if (!name) return form;
  const nodes = [...form.nodes, { id: newNodeId(), name }];
  return withLegDefaults({ ...form, nodes, legs: legsForNodes(nodes, form.nodes, form.legs) }, index, false);
}

/**
 * 追加一个**待命名的空节点**（0.10.0 起「添加节点」不再要求先打字：名字在行内先选后输）。
 *
 * 必须和增删/拖动一样重建分段：**不变量是 `legs.length === max(0, nodes.length - 1)`**——
 * 漏了这一步会让界面画出分段条而 `legs` 里并没有对应项，用户输进去的里程会被静默丢掉（0.10.0 实测踩到过）。
 */
export function withNodeAppended(form: EntryForm, index: SuggestIndex | null): EntryForm {
  const nodes = [...form.nodes, { id: newNodeId(), name: "" }];
  return withLegDefaults({ ...form, nodes, legs: legsForNodes(nodes, form.nodes, form.legs) }, index, false);
}

/**
 * 就地改名：只换这一个节点的名字，**不动已有里程**；但**空白**分段会按新名字重算历史默认值——
 * 这正是「先选/输入节点名 → 相邻路段自动带出里程」的路径（改名后原本无历史可查的段，这时才查得到）。
 */
export function withNodeRenamed(form: EntryForm, nodeId: string, name: string, index: SuggestIndex | null): EntryForm {
  const nodes = form.nodes.map((node) => (node.id === nodeId ? { ...node, name } : node));
  return withLegDefaults({ ...form, nodes }, index, false);
}

export function withNodeRemoved(form: EntryForm, nodeId: string, index: SuggestIndex | null): EntryForm {
  const nodes = form.nodes.filter((node) => node.id !== nodeId);
  if (nodes.length === form.nodes.length) return form;
  return withLegDefaults({ ...form, nodes, legs: legsForNodes(nodes, form.nodes, form.legs) }, index, false);
}

/** 无序端点对：判断“这一段”在重排前后是否还是同一条路（同一条路往返同值，所以不分方向）。 */
function pairKey(a: string, b: string): string {
  return [nameKey(a), nameKey(b)].sort().join("\u0001");
}

/**
 * 拖动重排：把节点移到 `toIndex`，并**按新顺序重算分段**。
 *
 * 里程的归属规则：仍然相邻的端点对保留原里程（同一条路出现多次时按先后依次对应），
 * 新出现的相邻对留空、再按历史默认值补齐——绝不让某个数字跟着节点跑到它没填过的路段上。
 */
export function withNodeMoved(
  form: EntryForm,
  nodeId: string,
  toIndex: number,
  index: SuggestIndex | null,
): EntryForm {
  const from = form.nodes.findIndex((node) => node.id === nodeId);
  if (from < 0) return form;
  const target = Math.max(0, Math.min(toIndex, form.nodes.length - 1));
  if (from === target) return form;

  const nodes = [...form.nodes];
  const moved = nodes[from];
  if (!moved) return form;
  nodes.splice(from, 1);
  nodes.splice(target, 0, moved);

  return withLegDefaults({ ...form, nodes, legs: legsForNodes(nodes, form.nodes, form.legs) }, index, false);
}

export function withLegValue(form: EntryForm, legIndex: number, value: string): EntryForm {
  const legs = form.legs.map((current, index) => (index === legIndex ? value : current));
  return { ...form, legs };
}

/** 整条链替换（常用路线 / 历史链填入）：分段按历史补齐（force 时覆盖）。 */
export function withChainApplied(
  form: EntryForm,
  nodes: string[],
  index: SuggestIndex | null,
  force = true,
): EntryForm {
  return withLegDefaults(
    {
      ...form,
      nodes: nodes.map((name) => ({ id: newNodeId(), name })),
      legs: nodes.slice(0, -1).map(() => ""),
    },
    index,
    force,
  );
}

/** 分段合计（只有每段都有效时才有值，避免把残缺输入当成总里程）。 */
export function formTotalKm(form: EntryForm): number | null {
  if (form.legs.length === 0) return null;
  let sum = 0;
  for (const value of form.legs) {
    const km = parseKmInput(value);
    if (km === null) return null;
    sum += km;
  }
  return Math.round(sum * 100) / 100;
}

export function tripToForm(trip: Trip, index: SuggestIndex | null): EntryForm {
  const form: EntryForm = {
    date: trip.date,
    nodes: trip.nodes.map((name) => ({ id: newNodeId(), name })),
    legs: (trip.legs ?? []).map((leg) => (leg.km === null || leg.km === undefined ? "" : formatKm(leg.km))),
    note: trip.note ?? "",
    editingId: trip.id,
  };
  return withLegDefaults(form, index, false);
}

export function formToPayload(form: EntryForm): TripPayload {
  const nodes = form.nodes.map((node) => normalizeName(node.name));
  return {
    date: form.date,
    nodes,
    legs: form.legs.map((value, i) => ({
      from: nodes[i] ?? "",
      to: nodes[i + 1] ?? "",
      km: kmState(value).value,
    })),
    totalKm: formTotalKm(form),
    note: form.note.trim(),
  };
}

/** 保存前检查：`missing` 为空白分段，`invalid` 为不合规输入（就地报错，不允许静默丢成「未填里程」）。 */
export function formKmIssues(form: EntryForm): { invalidLegIndexes: number[]; missingLegIndexes: number[] } {
  const invalidLegIndexes: number[] = [];
  const missingLegIndexes: number[] = [];
  form.legs.forEach((value, index) => {
    const state = kmState(value);
    if (state.invalid) invalidLegIndexes.push(index);
    else if (state.value === null) missingLegIndexes.push(index);
  });
  return { invalidLegIndexes, missingLegIndexes };
}

/** 保存前检查：空节点名（就地编辑可能留下空名字，保存时要说清是第几站）。 */
export function formNodeNameIssues(form: EntryForm): number[] {
  const indexes: number[] = [];
  form.nodes.forEach((node, nodeIndex) => {
    if (!normalizeName(node.name)) indexes.push(nodeIndex);
  });
  return indexes;
}