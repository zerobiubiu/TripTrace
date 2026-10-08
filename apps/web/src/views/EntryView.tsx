import { useMemo, useState } from "react";
import { NodeSuggestionInput } from "../components/NodeSuggestionInput";
import {
  createEntryForm,
  legSuggestion,
  totalHint,
  withLegValue,
  withNodeAdded,
  withNodeRemoved,
  withRecalculatedTotal,
  withRouteApplied,
  type EntryForm,
} from "../lib/entry";
import { chainText, formatDateLabel, formatKm, shiftDate, todayIso, weekdayLabel } from "../lib/format";
import { findRoute, recentRoutes, suggestNodeNames, type SuggestIndex } from "../lib/suggest";
import type { Trip } from "../types";

interface EntryViewProps {
  form: EntryForm;
  updateForm: (updater: (form: EntryForm) => EntryForm) => void;
  index: SuggestIndex | null;
  trips: Trip[];
  busy: boolean;
  onSave: () => void;
  onLoadTrip: (trip: Trip) => void;
}

export function EntryView({ form, updateForm, index, trips, busy, onSave, onLoadTrip }: EntryViewProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const suggestions = useMemo(() => suggestNodeNames(index, query, form.nodes, 8), [index, query, form.nodes]);
  const routeMatch = useMemo(() => findRoute(index, form.nodes), [index, form.nodes]);
  const quickRoutes = useMemo(() => recentRoutes(index, trips, 8), [index, trips]);
  const dayTrips = useMemo(() => trips.filter((trip) => trip.date === form.date), [trips, form.date]);
  const hint = totalHint(form);

  const dayKm = dayTrips.reduce((sum, trip) => sum + (trip.totalKm ?? 0), 0);
  const dayMissing = dayTrips.filter((trip) => trip.totalKm === null || trip.totalKm === undefined).length;

  const addNode = (name: string) => {
    updateForm((current) => withNodeAdded(current, name, index));
    setQuery("");
    setActiveIndex(-1);
  };

  const useQuickRoute = (routeIndex: number) => {
    const route = quickRoutes[routeIndex];
    if (!route) return;
    updateForm((current) => {
      const base: EntryForm = {
        ...current,
        nodes: [...route.nodes],
        legs: route.nodes.slice(0, -1).map(() => ""),
      };
      return withRouteApplied(base, route, true);
    });
  };

  return (
    <div className="page">
      <div className="entry-grid">
        <div className="entry-main">
          <section className="card">
            <div className="date-row">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => updateForm((current) => ({ ...current, date: shiftDate(current.date, -1) }))}
              >
                ‹ 前一天
              </button>
              <input
                type="date"
                className="input"
                aria-label="行程日期"
                value={form.date}
                onChange={(event) =>
                  updateForm((current) => ({ ...current, date: event.target.value || todayIso() }))
                }
              />
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => updateForm((current) => ({ ...current, date: shiftDate(current.date, 1) }))}
              >
                后一天 ›
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => updateForm((current) => ({ ...current, date: todayIso() }))}
              >
                今天
              </button>
              <span className="small muted">{weekdayLabel(form.date)}</span>
            </div>
            <p className="hint-line">
              {dayTrips.length === 0
                ? "这一天还没有记录"
                : `这一天已录 ${dayTrips.length} 条 · 合计 ${formatKm(Math.round(dayKm * 100) / 100)} 公里${
                    dayMissing > 0 ? ` · ${dayMissing} 条未填里程` : ""
                  }`}
            </p>
          </section>

          <section className="card">
            <p className="card-title">路线节点（按顺序添加）</p>
            <div className="chain">
              {form.nodes.length === 0 ? (
                <span className="small muted">还没有节点，例如：家 → 圣润 → 天九</span>
              ) : (
                form.nodes.map((name, nodeIndex) => (
                  <span className="chain-node" key={`${name}-${nodeIndex}`}>
                    {nodeIndex > 0 ? <span className="chain-arrow">→</span> : null}
                    <span className="node-chip">
                      {name}
                      <button
                        type="button"
                        aria-label={`移除 ${name}`}
                        onClick={() => updateForm((current) => withNodeRemoved(current, nodeIndex))}
                      >
                        ✕
                      </button>
                    </span>
                  </span>
                ))
              )}
            </div>

            <NodeSuggestionInput
              query={query}
              suggestions={suggestions}
              activeIndex={activeIndex}
              onQueryChange={setQuery}
              onActiveIndexChange={setActiveIndex}
              onPick={addNode}
            />

            <div className="actions">
              <button type="button" className="btn btn-sm" onClick={() => addNode(query)}>
                添加节点
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={form.nodes.length === 0}
                onClick={() => updateForm((current) => withNodeRemoved(current, current.nodes.length - 1))}
              >
                撤销上一个
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={form.nodes.length === 0}
                onClick={() => {
                  updateForm((current) => createEntryForm(current.date));
                  setQuery("");
                }}
              >
                清空
              </button>
            </div>

            {routeMatch ? (
              <p className="hint-line">
                历史路线：{formatDateLabel(routeMatch.date)} ·{" "}
                {routeMatch.totalKm === null ? "未填里程" : `${formatKm(routeMatch.totalKm)} 公里`}
                {routeMatch.count > 1 ? ` · 已走 ${routeMatch.count} 次` : ""}{" "}
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => updateForm((current) => withRouteApplied(current, routeMatch, true))}
                >
                  沿用这条
                </button>
              </p>
            ) : null}
          </section>

          {form.legs.length > 0 ? (
            <section className="card">
              <p className="card-title">分段里程（可不填，只填总里程也行）</p>
              <div className="leg-list">
                {form.legs.map((value, legIndex) => {
                  const suggestion = legSuggestion(index, form, legIndex);
                  const from = form.nodes[legIndex] ?? "";
                  const to = form.nodes[legIndex + 1] ?? "";
                  return (
                    <div className="leg" key={`${from}-${to}-${legIndex}`}>
                      <span className="leg-name">
                        {from} → {to}
                      </span>
                      <span className="leg-km">
                        {suggestion ? (
                          <button
                            type="button"
                            className="leg-suggest"
                            onClick={() =>
                              updateForm((current) => withLegValue(current, legIndex, formatKm(suggestion.km)))
                            }
                          >
                            {suggestion.reversed ? "反向 " : ""}
                            {formatKm(suggestion.km)} 公里
                          </button>
                        ) : null}
                        <input
                          className="input is-compact"
                          inputMode="decimal"
                          aria-label={`${from} 到 ${to} 的里程`}
                          placeholder={suggestion ? formatKm(suggestion.km) : "公里"}
                          value={value}
                          onChange={(event) =>
                            updateForm((current) => withLegValue(current, legIndex, event.target.value))
                          }
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="card">
            <p className="card-title">总里程</p>
            <div className="totals">
              <input
                className="input"
                inputMode="decimal"
                aria-label="总里程"
                placeholder="公里"
                value={form.total}
                onChange={(event) =>
                  updateForm((current) => ({ ...current, total: event.target.value, totalManual: true }))
                }
              />
              <span className={form.totalManual ? "badge" : "badge badge-auto"}>
                {form.totalManual ? "手动填写" : "自动合计"}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => updateForm((current) => withRecalculatedTotal({ ...current, totalManual: false }))}
              >
                按分段合计
              </button>
            </div>
            <p className="hint-line">
              {hint.text}
              {hint.diffKm !== null ? (
                <span className="badge badge-warn">与总里程差 {formatKm(hint.diffKm)} 公里</span>
              ) : null}
            </p>

            <div className="field">
              <label className="field-label" htmlFor="note-input">
                备注（可选）
              </label>
              <input
                id="note-input"
                className="input is-compact"
                maxLength={300}
                placeholder="例如：客户拜访 / 送货"
                value={form.note}
                onChange={(event) => updateForm((current) => ({ ...current, note: event.target.value }))}
              />
            </div>

            <div className="actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={onSave}>
                {busy ? "保存中…" : form.editingId ? "保存修改" : "保存行程"}
              </button>
              {form.editingId ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => updateForm((current) => createEntryForm(current.date))}
                >
                  取消编辑
                </button>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="entry-side">
          {quickRoutes.length > 0 ? (
            <section className="card">
              <p className="card-title">常用路线（点一下直接填）</p>
              <div className="row wrap">
                {quickRoutes.map((route, routeIndex) => (
                  <button
                    key={`${route.nodes.join("-")}-${route.date}`}
                    type="button"
                    className="btn btn-sm"
                    onClick={() => useQuickRoute(routeIndex)}
                  >
                    {chainText(route.nodes)} · {formatKm(route.totalKm)} 公里
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="card">
            <p className="card-title">{formatDateLabel(form.date)} 的记录</p>
            {dayTrips.length === 0 ? (
              <p className="small muted">还没有记录</p>
            ) : (
              <div className="list">
                {dayTrips.map((trip) => (
                  <div className="trip" key={trip.id}>
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
                      <span className="trip-actions">
                        <button type="button" className="btn btn-sm" onClick={() => onLoadTrip(trip)}>
                          编辑
                        </button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
