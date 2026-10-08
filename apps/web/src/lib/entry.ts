/** 填报表单的纯函数逻辑：节点链、分段建议、总里程自动合计/手动覆盖。 */

import type { Trip, TripPayload } from "../types";
import { formatKm, kmState, normalizeName, parseKmInput, todayIso } from "./format";
import { findRoute, suggestLegKm, type LegSuggestion, type RouteHit, type SuggestIndex } from "./suggest";

export interface EntryForm {
  date: string;
  nodes: string[];
  legs: string[];
  total: string;
  totalManual: boolean;
  suggestedTotal: number | null;
  note: string;
  editingId: string | null;
}

export function createEntryForm(date = todayIso()): EntryForm {
  return {
    date,
    nodes: [],
    legs: [],
    total: "",
    totalManual: false,
    suggestedTotal: null,
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

/** 非手动模式下刷新总里程输入（有分段按分段合计，否则用历史路线建议值）。 */
export function withRecalculatedTotal(form: EntryForm): EntryForm {
  if (form.totalManual) return form;
  const { sum, any } = legsSum(form.legs);
  if (any) return { ...form, total: formatKm(sum) };
  if (form.suggestedTotal !== null) return { ...form, total: formatKm(form.suggestedTotal) };
  return { ...form, total: "" };
}

export function withRouteApplied(form: EntryForm, route: RouteHit | null, force: boolean): EntryForm {
  if (!route) return form;
  const next: EntryForm = {
    ...form,
    legs: form.legs.map((value, index) => {
      if (!force && value) return value;
      const km = route.legs[index]?.km;
      return km === null || km === undefined ? value : formatKm(km);
    }),
    suggestedTotal: route.totalKm ?? form.suggestedTotal,
    totalManual: force ? false : form.totalManual,
  };
  return withRecalculatedTotal(next);
}

export function withNodeAdded(form: EntryForm, rawName: string, index: SuggestIndex | null): EntryForm {
  const name = normalizeName(rawName);
  if (!name) return form;
  const nodes = [...form.nodes, name];
  const legs = form.nodes.length > 0 ? [...form.legs, ""] : form.legs;
  return withRouteApplied({ ...form, nodes, legs }, findRoute(index, nodes), false);
}

export function withNodeRemoved(form: EntryForm, nodeIndex: number): EntryForm {
  if (nodeIndex < 0 || nodeIndex >= form.nodes.length) return form;
  const nodes = form.nodes.filter((_, index) => index !== nodeIndex);
  const legs = [...form.legs];
  if (legs.length > 0) {
    const legIndex = nodeIndex >= legs.length ? legs.length - 1 : nodeIndex;
    if (legIndex >= 0) legs.splice(legIndex, 1);
  }
  return withRecalculatedTotal({ ...form, nodes, legs });
}

export function withLegValue(form: EntryForm, legIndex: number, value: string): EntryForm {
  const legs = form.legs.map((current, index) => (index === legIndex ? value : current));
  return withRecalculatedTotal({ ...form, legs });
}

/** 某分段的建议里程：整条历史路线优先，其次同路段历史。 */
export function legSuggestion(
  index: SuggestIndex | null,
  form: EntryForm,
  legIndex: number,
): LegSuggestion | null {
  const route = findRoute(index, form.nodes);
  const routeKm = route?.legs[legIndex]?.km;
  if (routeKm !== null && routeKm !== undefined) {
    return { km: routeKm, count: route?.count ?? 1, lastDate: route?.date ?? "", reversed: false };
  }
  return suggestLegKm(index, form.nodes[legIndex] ?? "", form.nodes[legIndex + 1] ?? "");
}

/** 总里程提示：分段合计、历史路线参考、与手填总里程的差额。 */
export function totalHint(form: EntryForm): { text: string; diffKm: number | null } {
  const { sum, any } = legsSum(form.legs);
  const total = parseKmInput(form.total);
  const parts: string[] = [];
  if (any) parts.push(`分段合计 ${formatKm(sum)} 公里`);
  if (form.suggestedTotal !== null) parts.push(`历史路线 ${formatKm(form.suggestedTotal)} 公里`);

  const diffKm = total !== null && any && Math.abs(total - sum) > 0.01 ? Math.abs(total - sum) : null;

  if (!parts.length) return { text: "留空表示暂不填里程", diffKm: null };
  return { text: parts.join(" · "), diffKm };
}

export function tripToForm(trip: Trip): EntryForm {
  return {
    date: trip.date,
    nodes: [...trip.nodes],
    legs: (trip.legs ?? []).map((leg) => (leg.km === null || leg.km === undefined ? "" : formatKm(leg.km))),
    total: trip.totalKm === null || trip.totalKm === undefined ? "" : formatKm(trip.totalKm),
    totalManual: true,
    suggestedTotal: trip.totalKm ?? null,
    note: trip.note ?? "",
    editingId: trip.id,
  };
}

export function formToPayload(form: EntryForm): TripPayload {
  const nodes = form.nodes.map(normalizeName).filter(Boolean);
  return {
    date: form.date,
    nodes,
    legs: form.legs.map((value, index) => ({
      from: nodes[index] ?? "",
      to: nodes[index + 1] ?? "",
      km: kmState(value).value,
    })),
    totalKm: kmState(form.total).value,
    note: form.note.trim(),
  };
}

/** 保存前的非法输入检查：非法就就地报错，不允许静默丢成「未填里程」。 */
export function formKmIssues(form: EntryForm): { totalInvalid: boolean; invalidLegIndexes: number[] } {
  const invalidLegIndexes: number[] = [];
  form.legs.forEach((value, index) => {
    if (kmState(value).invalid) invalidLegIndexes.push(index);
  });
  return { totalInvalid: kmState(form.total).invalid, invalidLegIndexes };
}
