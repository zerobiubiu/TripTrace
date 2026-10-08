/** 行程接口：列表、新建、修改、删除、批量导入。挂在 /api 下，全部需要登录。 */

import { Hono } from "hono";
import type { BulkImportResponse, OkResponse, TripListResponse, TripResponse } from "@triptrace/contracts";
import { authedHandlers, type AppEnv } from "../lib/context";
import { assertSameOrigin, HttpError, readJsonBody } from "../lib/http";
import * as store from "../lib/store";
import {
  MAX_BULK_TRIPS,
  parseTripInput,
  serializeTrip,
  tripDedupeKey,
  tripRowFromInput,
  type TripInput,
} from "../lib/trips";

export const tripRoutes = new Hono<AppEnv>();

tripRoutes.get("/trips", ...authedHandlers, async (c) => {
  const rows = await store.listTrips(c.get("db"), c.get("user").id);
  const payload: TripListResponse = { trips: rows.map(serializeTrip) };
  return c.json(payload);
});

tripRoutes.post("/trips", ...authedHandlers, async (c) => {
  assertSameOrigin(c.req.raw, c.env);
  const input = parseTripInput(await readJsonBody<unknown>(c.req.raw));
  const row = tripRowFromInput(input, { userId: c.get("user").id, source: "manual" });
  await store.insertTrip(c.get("db"), row);
  const payload: TripResponse = { trip: serializeTrip(row) };
  return c.json(payload, 201);
});

tripRoutes.put("/trips/:id", ...authedHandlers, async (c) => {
  assertSameOrigin(c.req.raw, c.env);
  const tripId = c.req.param("id");
  const userId = c.get("user").id;
  const db = c.get("db");

  const existing = await store.findTrip(db, userId, tripId);
  if (!existing) throw new HttpError(404, "trip_not_found", "行程不存在或无权修改");

  const input = parseTripInput(await readJsonBody<unknown>(c.req.raw));
  const updatedAt = new Date().toISOString();
  await store.updateTrip(db, userId, tripId, {
    date: input.date,
    nodes: JSON.stringify(input.nodes),
    legs: JSON.stringify(input.legs),
    totalKm: input.totalKm,
    note: input.note,
    updatedAt,
  });

  const payload: TripResponse = {
    trip: serializeTrip({
      ...existing,
      date: input.date,
      nodes: JSON.stringify(input.nodes),
      legs: JSON.stringify(input.legs),
      totalKm: input.totalKm,
      note: input.note,
      updatedAt,
    }),
  };
  return c.json(payload);
});

tripRoutes.delete("/trips/:id", ...authedHandlers, async (c) => {
  assertSameOrigin(c.req.raw, c.env);
  const tripId = c.req.param("id");
  const userId = c.get("user").id;
  const db = c.get("db");

  const existing = await store.findTrip(db, userId, tripId);
  if (!existing) throw new HttpError(404, "trip_not_found", "行程不存在或无权删除");

  await store.deleteTrip(db, userId, tripId);
  const payload: OkResponse = { ok: true };
  return c.json(payload);
});

tripRoutes.post("/trips/bulk", ...authedHandlers, async (c) => {
  assertSameOrigin(c.req.raw, c.env);
  const userId = c.get("user").id;
  const db = c.get("db");

  const body = await readJsonBody<{ trips?: unknown }>(c.req.raw);
  if (!Array.isArray(body.trips)) throw new HttpError(400, "invalid_import", "trips 必须是数组");
  if (body.trips.length > MAX_BULK_TRIPS) {
    throw new HttpError(400, "invalid_import", `单次最多导入 ${MAX_BULK_TRIPS} 条行程`);
  }
  if (body.trips.length === 0) {
    const empty: BulkImportResponse = { created: 0, skipped: 0 };
    return c.json(empty);
  }

  const inputs: TripInput[] = body.trips.map((entry) => parseTripInput(entry));
  const dates = inputs.map((input) => input.date).sort();
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  if (!firstDate || !lastDate) {
    const empty: BulkImportResponse = { created: 0, skipped: 0 };
    return c.json(empty);
  }

  const existing = await store.listTripsInRange(db, userId, firstDate, lastDate);
  const seen = new Set(existing.map((row) => tripDedupeKey(row.date, JSON.parse(row.nodes) as string[])));

  const rows: ReturnType<typeof tripRowFromInput>[] = [];
  let skipped = 0;
  for (const input of inputs) {
    const key = tripDedupeKey(input.date, input.nodes);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    rows.push(tripRowFromInput(input, { userId, source: "import" }));
  }

  await store.insertTrips(db, rows);
  const payload: BulkImportResponse = { created: rows.length, skipped };
  return c.json(payload);
});
