/** 行程接口：列表、新增、修改、删除、批量导入。 */

import { requireSession } from "../lib/auth";
import { assertSameOrigin, HttpError, jsonResponse, readJsonBody } from "../lib/http";
import type { RouteContext, Router } from "../lib/router";
import * as store from "../lib/store";
import {
  MAX_BULK_TRIPS,
  parseTripInput,
  serializeTrip,
  tripDedupeKey,
  tripRowFromInput,
  type TripInput,
} from "../lib/trips";

async function handleListTrips({ request, env }: RouteContext): Promise<Response> {
  const session = await requireSession(env, request);
  const rows = await store.listTrips(env.DB, session.user.id);
  return jsonResponse({ trips: rows.map(serializeTrip) });
}

async function handleCreateTrip({ request, env }: RouteContext): Promise<Response> {
  assertSameOrigin(request);
  const session = await requireSession(env, request);
  const input = parseTripInput(await readJsonBody<unknown>(request));
  const row = tripRowFromInput(input, { userId: session.user.id, source: "manual" });
  await store.insertTrip(env.DB, row);
  return jsonResponse({ trip: serializeTrip(row) }, { status: 201 });
}

async function handleUpdateTrip({ request, env, params }: RouteContext): Promise<Response> {
  assertSameOrigin(request);
  const session = await requireSession(env, request);
  const tripId = params.id ?? "";
  const input = parseTripInput(await readJsonBody<unknown>(request));

  const updated = await store.updateTrip(env.DB, {
    id: tripId,
    user_id: session.user.id,
    date: input.date,
    nodes: JSON.stringify(input.nodes),
    legs: JSON.stringify(input.legs),
    total_km: input.totalKm,
    note: input.note,
    updated_at: new Date().toISOString(),
  });
  if (!updated) throw new HttpError(404, "trip_not_found", "行程不存在或无权修改");

  const row = await store.findTrip(env.DB, session.user.id, tripId);
  if (!row) throw new HttpError(404, "trip_not_found", "行程不存在或无权修改");
  return jsonResponse({ trip: serializeTrip(row) });
}

async function handleDeleteTrip({ request, env, params }: RouteContext): Promise<Response> {
  assertSameOrigin(request);
  const session = await requireSession(env, request);
  const tripId = params.id ?? "";
  const deleted = await store.deleteTrip(env.DB, session.user.id, tripId);
  if (!deleted) throw new HttpError(404, "trip_not_found", "行程不存在或无权删除");
  return jsonResponse({ ok: true });
}

async function handleBulkImport({ request, env }: RouteContext): Promise<Response> {
  assertSameOrigin(request);
  const session = await requireSession(env, request);
  const body = await readJsonBody<{ trips?: unknown }>(request);

  if (!Array.isArray(body.trips)) throw new HttpError(400, "invalid_import", "trips 必须是数组");
  if (body.trips.length > MAX_BULK_TRIPS) {
    throw new HttpError(400, "invalid_import", `单次最多导入 ${MAX_BULK_TRIPS} 条行程`);
  }
  if (body.trips.length === 0) return jsonResponse({ created: 0, skipped: 0 });

  const inputs: TripInput[] = body.trips.map((entry) => parseTripInput(entry));
  const dates = inputs.map((input) => input.date).sort();
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  if (!firstDate || !lastDate) return jsonResponse({ created: 0, skipped: 0 });

  const existing = await store.listTripsInRange(env.DB, session.user.id, firstDate, lastDate);
  const seen = new Set(
    existing.map((row) => tripDedupeKey(row.date, JSON.parse(row.nodes) as string[], row.total_km)),
  );

  const rows: store.TripRow[] = [];
  let skipped = 0;
  for (const input of inputs) {
    const key = tripDedupeKey(input.date, input.nodes, input.totalKm);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    rows.push(tripRowFromInput(input, { userId: session.user.id, source: "import" }));
  }

  await store.batchInsertTrips(env.DB, rows);
  return jsonResponse({ created: rows.length, skipped });
}

export function registerTripRoutes(router: Router): void {
  router.add("GET", "/api/trips", handleListTrips);
  router.add("POST", "/api/trips", handleCreateTrip);
  router.add("POST", "/api/trips/bulk", handleBulkImport);
  router.add("PUT", "/api/trips/:id", handleUpdateTrip);
  router.add("DELETE", "/api/trips/:id", handleDeleteTrip);
}
