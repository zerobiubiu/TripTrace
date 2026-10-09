/**
 * 填报表单的纯函数逻辑：节点链 + 分段里程。
 *
 * 规则（0.5.0 起）：**每一段里程都必须填**，否则不允许保存；总里程由分段合计得出，不再手填。
 * 每段默认带出历史值：整条历史路线优先，其次同路段（含反方向——同一条路往返里程相同）。
 */

import type { Trip, TripPayload } from "../types";
import { formatKm, kmState, normalizeName, parseKmInput, todayIso } from "./format";
import { findRoute, suggestLegKm, type LegSuggestion, type SuggestIndex } from "./suggest";

export interface EntryForm {
  date: string;
  nodes: string[];
  legs: string[];
  note: string;
  editingId: string | null;
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
  const route = findRoute(index, form.nodes);
  const routeKm = route?.legs[legIndex]?.km;
  if (routeKm !== null && routeKm !== undefined) {
    return { km: routeKm, count: route?.count ?? 1, lastDate: route?.date ?? "" };
  }
  return suggestLegKm(index, form.nodes[legIndex] ?? "", form.nodes[legIndex + 1] ?? "");
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

export function withNodeAdded(form: EntryForm, rawName: string, index: SuggestIndex | null): EntryForm {
  const name = normalizeName(rawName);
  if (!name) return form;
  const nodes = [...form.nodes, name];
  const legs = form.nodes.length > 0 ? [...form.legs, ""] : form.legs;
  return withLegDefaults({ ...form, nodes, legs }, index, false);
}

export function withNodeRemoved(form: EntryForm, nodeIndex: number, index: SuggestIndex | null): EntryForm {
  if (nodeIndex < 0 || nodeIndex >= form.nodes.length) return form;
  const nodes = form.nodes.filter((_, i) => i !== nodeIndex);
  const legs = [...form.legs];
  if (legs.length > 0) {
    const legIndex = nodeIndex >= legs.length ? legs.length - 1 : nodeIndex;
    if (legIndex >= 0) legs.splice(legIndex, 1);
  }
  return withLegDefaults({ ...form, nodes, legs }, index, false);
}

export function withLegValue(form: EntryForm, legIndex: number, value: string): EntryForm {
  const legs = form.legs.map((current, index) => (index === legIndex ? value : current));
  return { ...form, legs };
}

/**
 * 把节点 `from` 移到 `to`（0-based 节点下标）——拖动排序与键盘换位共用。
 *
 * 里程规则（brief 里确认过）：**仍相邻的端点对**保留原有里程（`from→to` 键，同名重复节点以首次出现为准）；
 * 不再相邻的手填值丢弃，空白段由历史默认值补齐（含反向推断）。
 */
export function withNodesReordered(
  form: EntryForm,
  from: number,
  to: number,
  index: SuggestIndex | null,
): EntryForm {
  const count = form.nodes.length;
  if (count < 2 || from < 0 || from >= count || to < 0 || to >= count || from === to) return form;

  const nodes = [...form.nodes];
  const [moved] = nodes.splice(from, 1);
  if (moved === undefined) return form;
  nodes.splice(to, 0, moved);

  const kept = new Map<string, string>();
  for (let i = 0; i < form.legs.length; i += 1) {
    const legFrom = form.nodes[i] ?? "";
    const legTo = form.nodes[i + 1] ?? "";
    const value = (form.legs[i] ?? "").trim();
    if (!legFrom || !legTo || !value) continue;
    const key = `${legFrom}\u0000${legTo}`;
    if (!kept.has(key)) kept.set(key, value);
  }

  const legs = nodes.slice(0, -1).map((legFrom, i) => {
    const legTo = nodes[i + 1] ?? "";
    return kept.get(`${legFrom}\u0000${legTo}`) ?? "";
  });

  return withLegDefaults({ ...form, nodes, legs }, index, false);
}

/** 整条链替换（常用路线 / 历史链填入）：分段按历史补齐（force 时覆盖）。 */
export function withChainApplied(
  form: EntryForm,
  nodes: string[],
  index: SuggestIndex | null,
  force = true,
): EntryForm {
  return withLegDefaults(
    { ...form, nodes: [...nodes], legs: nodes.slice(0, -1).map(() => "") },
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
    nodes: [...trip.nodes],
    legs: (trip.legs ?? []).map((leg) => (leg.km === null || leg.km === undefined ? "" : formatKm(leg.km))),
    note: trip.note ?? "",
    editingId: trip.id,
  };
  return withLegDefaults(form, index, false);
}

export function formToPayload(form: EntryForm): TripPayload {
  const nodes = form.nodes.map(normalizeName).filter(Boolean);
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
