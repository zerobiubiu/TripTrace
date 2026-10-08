import { useMemo } from "react";
import { chainText, formatDateLabel, formatKm, formatMonthLabel, weekdayLabel } from "../lib/format";
import type { Trip } from "../types";

interface RecordsViewProps {
  trips: Trip[];
  onEdit: (trip: Trip) => void;
  onDelete: (trip: Trip) => void;
}

interface DayGroup {
  date: string;
  trips: Trip[];
}

interface MonthGroup {
  monthKey: string;
  km: number;
  tripCount: number;
  days: DayGroup[];
}

function groupTrips(trips: Trip[]): MonthGroup[] {
  const months = new Map<string, { km: number; tripCount: number; days: Map<string, Trip[]> }>();

  for (const trip of trips) {
    const monthKey = trip.date.slice(0, 7);
    const bucket = months.get(monthKey) ?? { km: 0, tripCount: 0, days: new Map<string, Trip[]>() };
    if (trip.totalKm !== null && trip.totalKm !== undefined) bucket.km += trip.totalKm;
    bucket.tripCount += 1;
    const dayTrips = bucket.days.get(trip.date) ?? [];
    dayTrips.push(trip);
    bucket.days.set(trip.date, dayTrips);
    months.set(monthKey, bucket);
  }

  return [...months.entries()].map(([monthKey, bucket]) => ({
    monthKey,
    km: Math.round(bucket.km * 100) / 100,
    tripCount: bucket.tripCount,
    days: [...bucket.days.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, dayTrips]) => ({ date, trips: dayTrips })),
  }));
}

export function RecordsView({ trips, onEdit, onDelete }: RecordsViewProps) {
  const months = useMemo(() => groupTrips(trips), [trips]);

  if (trips.length === 0) {
    return (
      <div className="page">
        <section className="card">
          <p className="empty">还没有行程记录，去「填报」添加第一条吧。</p>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      {months.map((month) => (
        <section key={month.monthKey}>
          <div className="month-head">
            <span className="month-title">{formatMonthLabel(month.monthKey)}</span>
            <span className="small muted">
              {month.tripCount} 条 · {formatKm(month.km)} 公里
            </span>
          </div>

          {month.days.map((day) => {
            const dayKm = Math.round(day.trips.reduce((sum, trip) => sum + (trip.totalKm ?? 0), 0) * 100) / 100;
            return (
              <div className="day" key={day.date}>
                <div className="day-head">
                  <span className="day-title">{formatDateLabel(day.date)}</span>
                  <span className="muted tiny">{weekdayLabel(day.date)}</span>
                  <span className="badge">{formatKm(dayKm)} 公里</span>
                </div>
                <div className="list">
                  {day.trips.map((trip) => {
                    const legsWithKm = (trip.legs ?? []).filter((leg) => leg.km !== null && leg.km !== undefined);
                    return (
                      <article className="trip" key={trip.id}>
                        <div className="trip-chain">{chainText(trip.nodes)}</div>
                        <div className="trip-meta">
                          <span
                            className={
                              trip.totalKm === null || trip.totalKm === undefined
                                ? "badge badge-warn"
                                : "badge badge-auto"
                            }
                          >
                            {trip.totalKm === null || trip.totalKm === undefined
                              ? "未填里程"
                              : `${formatKm(trip.totalKm)} 公里`}
                          </span>
                          {trip.source === "import" ? <span className="badge">导入</span> : null}
                          {trip.note ? <span>{trip.note}</span> : null}
                          <span className="trip-actions">
                            <button type="button" className="btn btn-sm" onClick={() => onEdit(trip)}>
                              编辑
                            </button>
                            <button type="button" className="btn btn-sm btn-danger" onClick={() => onDelete(trip)}>
                              删除
                            </button>
                          </span>
                        </div>
                        {legsWithKm.length > 0 ? (
                          <p className="hint-line">
                            {legsWithKm
                              .map((leg) => `${leg.from} → ${leg.to} ${formatKm(leg.km)}`)
                              .join(" · ")}
                          </p>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
