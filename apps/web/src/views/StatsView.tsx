import { useMemo, useState } from "react";
import { formatKm } from "../lib/format";
import { computeStats } from "../lib/suggest";
import type { Trip } from "../types";

export function StatsView({ trips }: { trips: Trip[] }) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const stats = useMemo(() => computeStats(trips, year), [trips, year]);
  const maxMonthKm = Math.max(...stats.months.map((month) => month.km), 1);

  return (
    <div className="page">
      <div className="stats-grid">
        <section className="card">
          <div className="row-between">
            <p className="card-title">年度汇总</p>
            <div className="row">
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setYear((value) => value - 1)}>
                ‹
              </button>
              <span className="small">{stats.year} 年</span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setYear((value) => value + 1)}>
                ›
              </button>
            </div>
          </div>
          <div className="grid-cards">
            <div className="stat">
              <div className="stat-value">{formatKm(stats.totalKm)}</div>
              <div className="stat-label">总里程（公里）</div>
            </div>
            <div className="stat">
              <div className="stat-value">{stats.tripCount}</div>
              <div className="stat-label">行程次数</div>
            </div>
            <div className="stat">
              <div className="stat-value">{stats.dayCount}</div>
              <div className="stat-label">出行天数</div>
            </div>
            <div className="stat">
              <div className="stat-value">{stats.missingKm}</div>
              <div className="stat-label">未填里程</div>
            </div>
          </div>
        </section>

        <section className="card">
          <p className="card-title">月度分布</p>
          <div className="bars">
            {stats.months.map((month) => (
              <div className="bar" key={month.month}>
                <span>{month.month} 月</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${Math.round((month.km / maxMonthKm) * 100)}%` }} />
                </span>
                <span className="bar-value">{formatKm(month.km)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <p className="card-title">高频路段</p>
          {stats.topLegs.length === 0 ? (
            <p className="small muted">还没有分段里程数据；在填报时填写分段，或在导入时带上每段距离。</p>
          ) : (
            <div className="list">
              {stats.topLegs.map((leg) => (
                <div className="trip-meta" key={`${leg.from}-${leg.to}`}>
                  <span className="trip-chain">
                    {leg.from} → {leg.to}
                  </span>
                  <span className="badge">{formatKm(leg.km)} 公里</span>
                  <span>{leg.count} 次</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
