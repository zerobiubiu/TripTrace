/** 行程数组的本地更新辅助（保存/删除后就地更新，避免整表重拉）。 */

import type { Trip } from "../types";

export function upsertTrip(list: Trip[], trip: Trip): Trip[] {
  const merged = [trip, ...list.filter((item) => item.id !== trip.id)];
  return merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function removeTrip(list: Trip[], tripId: string): Trip[] {
  return list.filter((item) => item.id !== tripId);
}
