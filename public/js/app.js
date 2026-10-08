/**
 * 途迹 TripTrace 前端主程序（无构建步骤的原生 ES 模块）。
 * 交互要点：填报视图的结构性变化整体重绘，输入过程中的高频路径只做定点更新，避免丢失焦点。
 */

import { api } from "./api.js";
import { parseRecords } from "./import-text.js";
import {
  buildIndex,
  chainText,
  computeStats,
  findRoute,
  formatDateLabel,
  formatKm,
  normalizeName,
  recentRoutes,
  suggestLegKm,
  suggestNodeNames,
  weekdayLabel,
} from "./suggest.js";

const SAMPLE_TEXT = `圣润，家

单次25km

6.29

7.1-7.2

8.3

8.27-29

9.9
9.15
------

9.28
家，依剑，爱克森，圣祥小镇，依剑，爱克森，圣祥小镇，圣润  57 公里
圣润，家  25 公里

9.29
家，圣润，天九，圣润，天九，家  69 公里

10.5
家，圣润，爱克森，家  52 公里

10.6 家，圣润，家
10.7

10.8 家，圣润，天九，圣润，家`;

const app = document.getElementById("app");
const toastHost = document.getElementById("toast-host");

const state = {
  phase: "loading",
  user: null,
  version: "",
  signupCodeRequired: false,
  trips: [],
  index: null,
  tab: "entry",
  authMode: "login",
  authUsername: "",
  authError: "",
  busy: false,
  menuOpen: false,
  form: createEmptyForm(),
  query: "",
  suggestActive: -1,
  suggestOpen: false,
  quickRoutes: [],
  daySummary: { tripCount: 0, totalKm: 0, missing: 0 },
  import: { text: "", year: new Date().getFullYear(), entries: null, notes: [], error: "", busy: false },
  statsYear: new Date().getFullYear(),
  focusNode: false,
};

function pad2(value) {
  return String(value).padStart(2, "0");
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function shiftDate(iso, days) {
  const time = Date.parse(`${iso}T00:00:00`);
  if (Number.isNaN(time)) return todayIso();
  const shifted = new Date(time + days * 24 * 60 * 60 * 1000);
  return `${shifted.getFullYear()}-${pad2(shifted.getMonth() + 1)}-${pad2(shifted.getDate())}`;
}

function createEmptyForm(date = todayIso()) {
  return { date, nodes: [], legs: [], total: "", totalManual: false, suggestedTotal: null, note: "", editingId: null };
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

function parseKmInput(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100000) return null;
  return Math.round(value * 100) / 100;
}

function showToast(message, kind = "info") {
  if (!toastHost) return;
  const node = document.createElement("div");
  node.className = kind === "error" ? "toast is-error" : "toast";
  node.textContent = message;
  toastHost.appendChild(node);
  setTimeout(() => node.remove(), 3200);
}

function handleError(error) {
  if (error?.status === 401) {
    state.phase = "auth";
    state.user = null;
    state.authError = "登录已失效，请重新登录";
    render();
    return;
  }
  showToast(error?.message ?? "操作失败，请稍后重试", "error");
}

/* ---------------- 数据 ---------------- */

async function loadTrips() {
  const payload = await api.listTrips();
  state.trips = payload.trips ?? [];
  state.index = buildIndex(state.trips);
}

function upsertTrip(trip) {
  const list = state.trips.filter((item) => item.id !== trip.id);
  list.unshift(trip);
  list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  state.trips = list;
  state.index = buildIndex(list);
}

function removeTripLocal(id) {
  state.trips = state.trips.filter((item) => item.id !== id);
  state.index = buildIndex(state.trips);
}

function daySummaryFor(date) {
  let tripCount = 0;
  let totalKm = 0;
  let missing = 0;
  for (const trip of state.trips) {
    if (trip.date !== date) continue;
    tripCount += 1;
    if (trip.totalKm === null || trip.totalKm === undefined) missing += 1;
    else totalKm += trip.totalKm;
  }
  state.daySummary = { tripCount, totalKm: Math.round(totalKm * 100) / 100, missing };
}

/* ---------------- 表单内部逻辑 ---------------- */

function legsSum(form) {
  let sum = 0;
  let any = false;
  for (const value of form.legs) {
    const km = parseKmInput(value);
    if (km === null) continue;
    sum += km;
    any = true;
  }
  return { sum: Math.round(sum * 100) / 100, any };
}

function refreshTotal(form) {
  if (form.totalManual) return;
  const { sum, any } = legsSum(form);
  if (any) form.total = formatKm(sum);
  else if (form.suggestedTotal !== null && form.suggestedTotal !== undefined) form.total = formatKm(form.suggestedTotal);
  else form.total = "";
}

function applyRouteValues(route, options = {}) {
  if (!route) return;
  const form = state.form;
  const routeLegs = route.legs ?? [];
  form.legs = form.legs.map((value, index) => {
    if (options.force || !value) {
      const km = routeLegs[index]?.km;
      if (km !== null && km !== undefined) return formatKm(km);
    }
    return value;
  });
  if (route.totalKm !== null && route.totalKm !== undefined) form.suggestedTotal = route.totalKm;
  if (options.force) form.totalManual = false;
  refreshTotal(form);
}

function addNode(rawName) {
  const name = normalizeName(rawName);
  if (!name) return;
  const form = state.form;
  if (form.nodes.length >= 40) {
    showToast("节点数量已达上限（40）", "error");
    return;
  }
  const hadNodes = form.nodes.length > 0;
  form.nodes.push(name);
  if (hadNodes) form.legs.push("");
  state.query = "";
  state.suggestActive = -1;
  state.suggestOpen = false;
  applyRouteValues(findRoute(state.index, form.nodes));
  state.focusNode = true;
  render();
}

function removeNode(index) {
  const form = state.form;
  if (index < 0 || index >= form.nodes.length) return;
  form.nodes.splice(index, 1);
  if (form.legs.length > 0) {
    const legIndex = index >= form.legs.length ? form.legs.length - 1 : index;
    if (legIndex >= 0) form.legs.splice(legIndex, 1);
  }
  refreshTotal(form);
  state.focusNode = true;
  render();
}

function currentSuggestions() {
  if (!state.index) return [];
  return suggestNodeNames(state.index, state.query, state.form.nodes, 8);
}

/* ---------------- 渲染：鉴权 ---------------- */

function renderAuth() {
  const isRegister = state.authMode === "register";
  return `
    <div class="topbar">
      <div class="brand"><img class="brand-mark" src="/icon.svg" alt="">途迹 TripTrace</div>
    </div>
    <div class="card auth-card">
      <h1>${isRegister ? "创建账号" : "登录途迹"}</h1>
      <p class="small muted">记录每日出差行程的节点与里程，历史路线自动帮你补全距离。</p>
      <div class="switcher">
        <button data-action="auth-mode" data-mode="login" class="${isRegister ? "" : "is-active"}">登录</button>
        <button data-action="auth-mode" data-mode="register" class="${isRegister ? "is-active" : ""}">注册</button>
      </div>
      <form data-form="${isRegister ? "register" : "login"}">
        <div class="field">
          <label class="field-label" for="auth-username">用户名</label>
          <input class="input" id="auth-username" name="username" value="${esc(state.authUsername)}" autocomplete="username" required>
        </div>
        ${
          isRegister
            ? `<div class="field">
                 <label class="field-label" for="auth-display">显示名（可选）</label>
                 <input class="input" id="auth-display" name="displayName" autocomplete="nickname" placeholder="例如：小王">
               </div>`
            : ""
        }
        <div class="field">
          <label class="field-label" for="auth-password">密码</label>
          <input class="input" id="auth-password" name="password" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}" required>
        </div>
        ${
          isRegister
            ? `<div class="field">
                 <label class="field-label" for="auth-password2">确认密码</label>
                 <input class="input" id="auth-password2" name="password2" type="password" autocomplete="new-password" required>
               </div>`
            : ""
        }
        ${
          isRegister && state.signupCodeRequired
            ? `<div class="field">
                 <label class="field-label" for="auth-code">邀请码</label>
                 <input class="input" id="auth-code" name="signupCode" required>
               </div>`
            : ""
        }
        <div class="form-error">${esc(state.authError)}</div>
        <div class="actions">
          <button class="btn btn-primary" type="submit" ${state.busy ? "disabled" : ""}>
            ${state.busy ? "处理中…" : isRegister ? "注册并登录" : "登录"}
          </button>
        </div>
      </form>
      <p class="tiny muted">登录状态保存在本设备（HttpOnly Cookie，400 天滚动续期），日常使用不会失效。</p>
    </div>
  `;
}

/* ---------------- 渲染：主壳 ---------------- */

function renderShell() {
  const tabs = [
    ["entry", "填报"],
    ["records", "记录"],
    ["stats", "汇总"],
    ["import", "导入"],
  ];
  return `
    <div class="topbar">
      <div class="brand"><img class="brand-mark" src="/icon.svg" alt="">途迹</div>
      <div class="topbar-actions">
        <span class="who">${esc(state.user?.displayName ?? "")}</span>
        <div class="menu-wrap">
          <button class="icon-btn" data-action="toggle-menu" aria-label="更多操作">⋯</button>
          ${state.menuOpen ? renderMenu() : ""}
        </div>
      </div>
    </div>
    <div class="tabs">
      ${tabs
        .map(
          ([key, label]) =>
            `<button class="tab ${state.tab === key ? "is-active" : ""}" data-action="tab" data-tab="${key}">${label}</button>`,
        )
        .join("")}
    </div>
    <div class="view">
      ${state.tab === "entry" ? renderEntry() : ""}
      ${state.tab === "records" ? renderRecords() : ""}
      ${state.tab === "stats" ? renderStats() : ""}
      ${state.tab === "import" ? renderImport() : ""}
    </div>
    <p class="footer">途迹 TripTrace v${esc(state.version || "dev")} · 数据存于你的 Cloudflare 账号（Workers + D1 + KV）</p>
    <dialog class="sheet" id="pwd-dialog">
      <form data-form="password">
        <p class="card-title">修改密码</p>
        <div class="field">
          <label class="field-label" for="pwd-current">当前密码</label>
          <input class="input" id="pwd-current" name="currentPassword" type="password" autocomplete="current-password" required>
        </div>
        <div class="field">
          <label class="field-label" for="pwd-next">新密码（至少 8 位）</label>
          <input class="input" id="pwd-next" name="newPassword" type="password" autocomplete="new-password" required>
        </div>
        <div class="field">
          <label class="field-label" for="pwd-next2">确认新密码</label>
          <input class="input" id="pwd-next2" name="newPassword2" type="password" autocomplete="new-password" required>
        </div>
        <div class="actions">
          <button class="btn btn-primary" type="submit">保存</button>
          <button class="btn" type="button" data-action="close-password">取消</button>
        </div>
      </form>
    </dialog>
  `;
}

function renderMenu() {
  return `
    <div class="menu">
      <button data-action="open-password">修改密码</button>
      <button data-action="export">导出数据（JSON）</button>
      <button data-action="logout">退出登录</button>
    </div>
  `;
}

/* ---------------- 渲染：填报 ---------------- */

function renderEntry() {
  const form = state.form;
  daySummaryFor(form.date);
  const summary = state.daySummary;
  const suggestions = currentSuggestions();

  return `
    <div class="card">
      <div class="date-row">
        <button class="btn btn-sm btn-ghost" data-action="date-shift" data-days="-1">‹ 前一天</button>
        <input class="input" type="date" data-field="date" value="${esc(form.date)}">
        <button class="btn btn-sm btn-ghost" data-action="date-shift" data-days="1">后一天 ›</button>
        <button class="btn btn-sm" data-action="date-today">今天</button>
        <span class="small muted" id="day-weekday">${weekdayLabel(form.date)}</span>
      </div>
      <p class="hint-line" id="day-summary">${renderDaySummary()}</p>
    </div>

    <div class="card">
      <p class="card-title">路线节点（按顺序添加）</p>
      <div class="chain">${renderChain()}</div>
      <div class="suggest-wrap">
        <input class="input" id="node-input" data-field="node-query" value="${esc(state.query)}"
               placeholder="输入节点名称，回车添加" autocomplete="off" enterkeyhint="done">
        <div id="suggest-host">${state.suggestOpen ? renderSuggestItems(suggestions) : ""}</div>
      </div>
      <div class="actions">
        <button class="btn btn-sm" data-action="add-node">添加节点</button>
        <button class="btn btn-sm btn-ghost" data-action="undo-node" ${form.nodes.length ? "" : "disabled"}>撤销上一个</button>
        <button class="btn btn-sm btn-ghost" data-action="clear-chain" ${form.nodes.length ? "" : "disabled"}>清空</button>
      </div>
      ${renderRouteHint()}
    </div>

    ${
      form.legs.length
        ? `<div class="card">
             <p class="card-title">分段里程（可不填，只填总里程也行）</p>
             <div class="leg-list">${form.legs.map((value, index) => renderLegRow(value, index)).join("")}</div>
           </div>`
        : ""
    }

    <div class="card">
      <p class="card-title">总里程</p>
      <div class="totals">
        <input class="input" id="total-input" inputmode="decimal" data-field="total" value="${esc(form.total)}" placeholder="公里">
        <span id="total-badge">${renderTotalBadge()}</span>
        <button class="btn btn-sm btn-ghost" data-action="auto-total">按分段合计</button>
      </div>
      <p class="hint-line" id="total-hint">${renderTotalHint()}</p>
      <div class="field">
        <label class="field-label" for="note-input">备注（可选）</label>
        <input class="input is-compact" id="note-input" data-field="note" value="${esc(form.note)}" maxlength="300" placeholder="例如：客户拜访 / 送货">
      </div>
      <div class="actions">
        <button class="btn btn-primary" data-action="save" ${state.busy ? "disabled" : ""}>
          ${state.busy ? "保存中…" : form.editingId ? "保存修改" : "保存行程"}
        </button>
        ${form.editingId ? `<button class="btn" data-action="cancel-edit">取消编辑</button>` : ""}
      </div>
    </div>

    ${renderQuickRoutes()}
  `;
}

function renderDaySummary() {
  const summary = state.daySummary;
  if (summary.tripCount === 0) return `这一天还没有记录`;
  const parts = [`这一天已录 ${summary.tripCount} 条`, `合计 ${formatKm(summary.totalKm)} 公里`];
  if (summary.missing > 0) parts.push(`${summary.missing} 条未填里程`);
  return parts.join(" · ");
}

function renderChain() {
  const nodes = state.form.nodes;
  if (nodes.length === 0) return `<span class="small muted">还没有节点，例如：家 → 圣润 → 天九</span>`;
  return nodes
    .map((name, index) => {
      const arrow = index > 0 ? `<span class="chain-arrow">→</span>` : "";
      return `${arrow}<span class="node-chip">${esc(name)}<button data-action="remove-node" data-index="${index}" aria-label="移除 ${esc(name)}">✕</button></span>`;
    })
    .join("");
}

function renderSuggestItems(suggestions) {
  if (!suggestions.length) return "";
  return `<div class="suggest">${suggestions
    .map(
      (entry, index) => `
      <div class="suggest-item ${index === state.suggestActive ? "is-active" : ""}" data-action="pick-suggestion" data-index="${index}">
        <span>${esc(entry.name)}</span>
        <span class="hint">用过 ${entry.count} 次</span>
      </div>`,
    )
    .join("")}</div>`;
}

function renderRouteHint() {
  const route = findRoute(state.index, state.form.nodes);
  if (!route) return "";
  const km = route.totalKm === null || route.totalKm === undefined ? "未填里程" : `${formatKm(route.totalKm)} 公里`;
  return `<p class="hint-line">历史路线：${formatDateLabel(route.date)} · ${km}${
    route.count > 1 ? ` · 已走 ${route.count} 次` : ""
  } <button class="btn btn-sm" data-action="apply-route">沿用这条</button></p>`;
}

function legSuggestion(index) {
  const form = state.form;
  const route = findRoute(state.index, form.nodes);
  const routeKm = route?.legs?.[index]?.km;
  if (routeKm !== null && routeKm !== undefined) return { km: routeKm, reversed: false, count: route.count };
  return suggestLegKm(state.index, form.nodes[index] ?? "", form.nodes[index + 1] ?? "");
}

function renderLegRow(value, index) {
  const suggestion = legSuggestion(index);
  const from = state.form.nodes[index] ?? "";
  const to = state.form.nodes[index + 1] ?? "";
  return `
    <div class="leg">
      <span class="leg-name">${esc(from)} → ${esc(to)}</span>
      <span class="leg-km">
        ${
          suggestion
            ? `<button class="leg-suggest" data-action="use-leg-suggest" data-index="${index}">${
                suggestion.reversed ? "反向 " : ""
              }${formatKm(suggestion.km)} 公里</button>`
            : ""
        }
        <input class="input is-compact" inputmode="decimal" data-field="leg" data-index="${index}" value="${esc(value)}"
               placeholder="${suggestion ? formatKm(suggestion.km) : "公里"}">
      </span>
    </div>
  `;
}

function renderTotalBadge() {
  return state.form.totalManual
    ? `<span class="badge">手动填写</span>`
    : `<span class="badge badge-auto">自动合计</span>`;
}

function renderTotalHint() {
  const form = state.form;
  const { sum, any } = legsSum(form);
  const total = parseKmInput(form.total);
  const parts = [];
  if (any) parts.push(`分段合计 ${formatKm(sum)} 公里`);
  if (form.suggestedTotal !== null && form.suggestedTotal !== undefined) {
    parts.push(`历史路线 ${formatKm(form.suggestedTotal)} 公里`);
  }
  if (total !== null && any && Math.abs(total - sum) > 0.01) {
    return `${parts.join(" · ")}<span class="badge badge-warn">与总里程差 ${formatKm(Math.abs(total - sum))} 公里</span>`;
  }
  if (!parts.length) return "留空表示暂不填里程";
  return parts.join(" · ");
}

function renderQuickRoutes() {
  state.quickRoutes = recentRoutes(state.index ?? { routes: new Map() }, state.trips, 6).filter(
    (route) => route.nodes.length > 1,
  );
  if (!state.quickRoutes.length) return "";
  return `
    <div class="card">
      <p class="card-title">常用路线（点一下直接填）</p>
      <div class="row wrap">
        ${state.quickRoutes
          .map(
            (route, index) =>
              `<button class="btn btn-sm" data-action="use-route" data-index="${index}">${esc(
                chainText(route.nodes),
              )} · ${formatKm(route.totalKm)} 公里</button>`,
          )
          .join("")}
      </div>
    </div>
  `;
}

/* ---------------- 渲染：记录 ---------------- */

function renderRecords() {
  if (!state.trips.length) {
    return `<div class="card"><p class="empty">还没有行程记录，去「填报」添加第一条吧。</p></div>`;
  }

  const months = new Map();
  for (const trip of state.trips) {
    const key = String(trip.date).slice(0, 7);
    const bucket = months.get(key) ?? { km: 0, tripCount: 0, days: new Map() };
    if (trip.totalKm !== null && trip.totalKm !== undefined) bucket.km += trip.totalKm;
    bucket.tripCount += 1;
    const dayTrips = bucket.days.get(trip.date) ?? [];
    dayTrips.push(trip);
    bucket.days.set(trip.date, dayTrips);
    months.set(key, bucket);
  }

  return [...months.entries()]
    .map(([monthKey, bucket]) => {
      const [year, month] = monthKey.split("-");
      const days = [...bucket.days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
      return `
        <div class="month-head">
          <span class="month-title">${esc(year)}年${Number.parseInt(month ?? "0", 10)}月</span>
          <span class="small muted">${bucket.tripCount} 条 · ${formatKm(Math.round(bucket.km * 100) / 100)} 公里</span>
        </div>
        ${days
          .map(([date, trips]) => {
            const dayKm = Math.round(trips.reduce((sum, trip) => sum + (trip.totalKm ?? 0), 0) * 100) / 100;
            return `
              <div class="day">
                <div class="day-head">
                  <span class="day-title">${formatDateLabel(date)}</span>
                  <span class="muted tiny">${weekdayLabel(date)}</span>
                  <span class="badge">${formatKm(dayKm)} 公里</span>
                </div>
                <div class="list">${trips.map((trip) => renderTripCard(trip)).join("")}</div>
              </div>
            `;
          })
          .join("")}
      `;
    })
    .join("");
}

function renderTripCard(trip) {
  const legsWithKm = (trip.legs ?? []).filter((leg) => leg.km !== null && leg.km !== undefined);
  const legsText = legsWithKm.map((leg) => `${esc(leg.from)} → ${esc(leg.to)} ${formatKm(leg.km)}`).join(" · ");
  return `
    <div class="trip">
      <div class="trip-chain">${esc(chainText(trip.nodes))}</div>
      <div class="trip-meta">
        <span class="badge ${trip.totalKm === null || trip.totalKm === undefined ? "badge-warn" : "badge-auto"}">
          ${trip.totalKm === null || trip.totalKm === undefined ? "未填里程" : `${formatKm(trip.totalKm)} 公里`}
        </span>
        ${trip.source === "import" ? `<span class="badge">导入</span>` : ""}
        ${trip.note ? `<span>${esc(trip.note)}</span>` : ""}
        <span class="trip-actions">
          <button class="btn btn-sm" data-action="edit-trip" data-id="${esc(trip.id)}">编辑</button>
          <button class="btn btn-sm btn-danger" data-action="delete-trip" data-id="${esc(trip.id)}">删除</button>
        </span>
      </div>
      ${legsText ? `<div class="hint-line">${legsText}</div>` : ""}
    </div>
  `;
}

/* ---------------- 渲染：汇总 ---------------- */

function renderStats() {
  const stats = computeStats(state.trips, state.statsYear);
  const maxMonthKm = Math.max(...stats.months.map((month) => month.km), 1);
  return `
    <div class="card">
      <div class="row-between">
        <p class="card-title">年度汇总</p>
        <div class="row">
          <button class="btn btn-sm btn-ghost" data-action="stats-year" data-delta="-1">‹</button>
          <span class="small">${stats.year} 年</span>
          <button class="btn btn-sm btn-ghost" data-action="stats-year" data-delta="1">›</button>
        </div>
      </div>
      <div class="grid-cards">
        <div class="stat"><div class="stat-value">${formatKm(stats.totalKm)}</div><div class="stat-label">总里程（公里）</div></div>
        <div class="stat"><div class="stat-value">${stats.tripCount}</div><div class="stat-label">行程次数</div></div>
        <div class="stat"><div class="stat-value">${stats.dayCount}</div><div class="stat-label">出行天数</div></div>
        <div class="stat"><div class="stat-value">${stats.missingKm}</div><div class="stat-label">未填里程</div></div>
      </div>
    </div>

    <div class="card">
      <p class="card-title">月度分布</p>
      <div class="bars">
        ${stats.months
          .map(
            (month) => `
            <div class="bar">
              <span>${month.month} 月</span>
              <span class="bar-track"><span class="bar-fill" data-width="${Math.round(
                (month.km / maxMonthKm) * 100,
              )}"></span></span>
              <span class="bar-value">${formatKm(month.km)}</span>
            </div>`,
          )
          .join("")}
      </div>
    </div>

    <div class="card">
      <p class="card-title">高频路段</p>
      ${
        stats.topLegs.length
          ? `<div class="list">${stats.topLegs
              .map(
                (leg) => `
                <div class="trip-meta">
                  <span class="trip-chain">${esc(leg.from)} → ${esc(leg.to)}</span>
                  <span class="badge">${formatKm(leg.km)} 公里</span>
                  <span>${leg.count} 次</span>
                </div>`,
              )
              .join("")}</div>`
          : `<p class="small muted">还没有分段里程数据；在填报时填写分段，或在导入时带上每段距离。</p>`
      }
    </div>
  `;
}

/* ---------------- 渲染：导入 ---------------- */

function renderImport() {
  const entries = state.import.entries;
  const checkedCount = entries ? entries.filter((entry) => entry.checked).length : 0;
  return `
    <div class="card">
      <p class="card-title">导入历史文本</p>
      <p class="small muted">支持“日期 + 节点链 + 里程”的文本记录：只写日期、只写节点、写总里程都可以。</p>
      <div class="field">
        <textarea class="input" data-field="import-text" placeholder="例如：${esc(
          "9.28\n家，依剑，爱克森，圣润  57 公里",
        )}">${esc(state.import.text)}</textarea>
      </div>
      <div class="row wrap">
        <label class="small muted" for="import-year">年份</label>
        <input class="input is-compact" id="import-year" type="number" min="2000" max="2100" data-field="import-year" value="${state.import.year}">
        <button class="btn btn-sm" data-action="parse-import">解析预览</button>
        <button class="btn btn-sm btn-ghost" data-action="fill-sample">填入示例</button>
        <button class="btn btn-sm btn-ghost" data-action="clear-import">清空</button>
      </div>
      <p class="hint-line">${esc(state.import.error)}</p>
    </div>

    ${
      state.import.notes.length
        ? `<div class="card"><p class="card-title">解析说明</p><div class="list">${state.import.notes
            .map((note) => `<div class="small muted">· ${esc(note)}</div>`)
            .join("")}</div></div>`
        : ""
    }

    ${
      entries
        ? `<div class="card">
             <div class="row-between">
               <p class="card-title" id="import-result-title">解析结果（${entries.length} 条，已选 ${checkedCount} 条）</p>
               <div class="row">
                 <button class="btn btn-sm btn-ghost" data-action="select-all-import" data-value="1">全选</button>
                 <button class="btn btn-sm btn-ghost" data-action="select-all-import" data-value="0">全不选</button>
               </div>
             </div>
             <div class="list">
               ${entries
                 .map(
                   (entry, index) => `
                   <label class="check-row">
                     <input type="checkbox" data-field="import-check" data-index="${index}" ${entry.checked ? "checked" : ""}>
                     <span class="check-body">
                       <span class="check-title">${formatDateLabel(entry.date)} · ${esc(chainText(entry.nodes))}</span>
                       <span class="tiny muted"> · ${
                         entry.totalKm === null || entry.totalKm === undefined
                           ? "未填里程"
                           : `${formatKm(entry.totalKm)} 公里`
                       }</span>
                       ${entry.hint ? `<div class="tiny muted">${esc(entry.hint)}</div>` : ""}
                     </span>
                   </label>`,
                 )
                 .join("")}
             </div>
             <div class="actions">
               <button class="btn btn-primary" id="import-run" data-action="run-import" ${
                 checkedCount === 0 || state.import.busy ? "disabled" : ""
               }>
                 ${state.import.busy ? "导入中…" : `导入选中的 ${checkedCount} 条`}
               </button>
             </div>
           </div>`
        : ""
    }
  `;
}

/* ---------------- 主渲染 ---------------- */

/** CSP 禁止行内 style 属性，宽度类视觉效果用 CSSOM 赋值（不受 style-src 限制）。 */
function applyDynamicStyles() {
  if (!app) return;
  for (const node of app.querySelectorAll("[data-width]")) {
    const width = Number(node.dataset.width);
    if (Number.isFinite(width)) node.style.width = `${Math.max(0, Math.min(100, width))}%`;
  }
}

function render() {
  if (!app) return;
  if (state.phase === "loading") {
    app.innerHTML = `<div class="boot">正在载入途迹…</div>`;
    return;
  }
  if (state.phase === "auth") {
    app.innerHTML = renderAuth();
    return;
  }
  app.innerHTML = renderShell();
  applyDynamicStyles();
  if (state.focusNode) {
    state.focusNode = false;
    app.querySelector("#node-input")?.focus();
  }
}

/* 定点更新（输入过程中不整体重绘） */
function updateSuggestHost() {
  const host = app?.querySelector("#suggest-host");
  if (!host) return;
  host.innerHTML = state.suggestOpen ? renderSuggestItems(currentSuggestions()) : "";
}

function updateTotalValueDom() {
  const input = app?.querySelector("#total-input");
  if (input && !state.form.totalManual) input.value = state.form.total;
}

function updateTotalMetaDom() {
  const badge = app?.querySelector("#total-badge");
  if (badge) badge.outerHTML = `<span id="total-badge">${renderTotalBadge()}</span>`;
  const hint = app?.querySelector("#total-hint");
  if (hint) hint.innerHTML = renderTotalHint();
}

function updateDaySummaryDom() {
  daySummaryFor(state.form.date);
  const summary = app?.querySelector("#day-summary");
  if (summary) summary.innerHTML = renderDaySummary();
  const weekday = app?.querySelector("#day-weekday");
  if (weekday) weekday.textContent = weekdayLabel(state.form.date);
}

/** 勾选变化只更新计数与按钮，避免整表重绘导致滚动位置跳动。 */
function updateImportCountsDom() {
  const entries = state.import.entries ?? [];
  const checked = entries.filter((entry) => entry.checked).length;
  const title = app?.querySelector("#import-result-title");
  if (title) title.textContent = `解析结果（${entries.length} 条，已选 ${checked} 条）`;
  const button = app?.querySelector("#import-run");
  if (button) {
    button.textContent = state.import.busy ? "导入中…" : `导入选中的 ${checked} 条`;
    button.disabled = checked === 0 || state.import.busy;
  }
}

/* ---------------- 事件处理 ---------------- */

function onInput(event) {
  const target = event.target;
  const field = target?.dataset?.field;
  if (!field) return;
  const form = state.form;

  switch (field) {
    case "node-query":
      state.query = target.value;
      state.suggestActive = -1;
      state.suggestOpen = true;
      updateSuggestHost();
      return;
    case "leg": {
      const index = Number(target.dataset.index);
      if (Number.isInteger(index)) form.legs[index] = target.value;
      if (!form.totalManual) {
        refreshTotal(form);
        updateTotalValueDom();
      }
      updateTotalMetaDom();
      return;
    }
    case "total":
      form.totalManual = true;
      form.total = target.value;
      updateTotalMetaDom();
      return;
    case "note":
      form.note = target.value;
      return;
    case "date":
      form.date = target.value || todayIso();
      updateDaySummaryDom();
      return;
    case "import-text":
      state.import.text = target.value;
      return;
    case "import-year": {
      const year = Number.parseInt(target.value, 10);
      if (Number.isFinite(year) && year >= 2000 && year <= 2100) state.import.year = year;
      return;
    }
    default:
      return;
  }
}

function onChange(event) {
  const target = event.target;
  if (target?.dataset?.field !== "import-check") return;
  const index = Number(target.dataset.index ?? "-1");
  const entry = state.import.entries?.[index];
  if (!entry) return;
  entry.checked = Boolean(target.checked);
  updateImportCountsDom();
}

function onFocusIn(event) {
  if (event.target?.id === "node-input") {
    state.suggestOpen = true;
    updateSuggestHost();
  }
}

function onKeyDown(event) {
  const field = event.target?.dataset?.field;
  if (field !== "node-query") return;
  const suggestions = currentSuggestions();

  if (event.key === "ArrowDown" && suggestions.length) {
    event.preventDefault();
    state.suggestActive = (state.suggestActive + 1) % suggestions.length;
    updateSuggestHost();
    return;
  }
  if (event.key === "ArrowUp" && suggestions.length) {
    event.preventDefault();
    state.suggestActive = (state.suggestActive - 1 + suggestions.length) % suggestions.length;
    updateSuggestHost();
    return;
  }
  if (event.key === "Escape") {
    state.query = "";
    state.suggestActive = -1;
    state.suggestOpen = false;
    event.target.value = "";
    updateSuggestHost();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const picked = state.suggestActive >= 0 ? suggestions[state.suggestActive] : undefined;
    addNode(picked?.name ?? event.target.value);
  }
}

async function onSubmit(event) {
  const formName = event.target?.dataset?.form;
  if (!formName) return;
  event.preventDefault();
  const data = new FormData(event.target);
  if (formName === "login" || formName === "register") {
    state.authUsername = String(data.get("username") ?? "");
  }

  if (formName === "login") {
    state.busy = true;
    state.authError = "";
    render();
    try {
      const payload = await api.login(String(data.get("username") ?? ""), String(data.get("password") ?? ""));
      state.user = payload.user;
      await loadTrips();
      state.phase = "ready";
      state.form = createEmptyForm();
      showToast(`欢迎回来，${payload.user.displayName}`);
    } catch (error) {
      state.authError = error?.message ?? "登录失败";
    } finally {
      state.busy = false;
      render();
    }
    return;
  }

  if (formName === "register") {
    const password = String(data.get("password") ?? "");
    const password2 = String(data.get("password2") ?? "");
    if (password !== password2) {
      state.authError = "两次输入的密码不一致";
      render();
      return;
    }
    state.busy = true;
    state.authError = "";
    render();
    try {
      const payload = await api.register({
        username: String(data.get("username") ?? ""),
        displayName: String(data.get("displayName") ?? ""),
        password,
        signupCode: String(data.get("signupCode") ?? ""),
      });
      state.user = payload.user;
      await loadTrips();
      state.phase = "ready";
      state.form = createEmptyForm();
      showToast("账号已创建，开始记录吧");
    } catch (error) {
      state.authError = error?.message ?? "注册失败";
    } finally {
      state.busy = false;
      render();
    }
    return;
  }

  if (formName === "password") {
    const password = String(data.get("newPassword") ?? "");
    const password2 = String(data.get("newPassword2") ?? "");
    if (password !== password2) {
      showToast("两次输入的新密码不一致", "error");
      return;
    }
    try {
      await api.changePassword(String(data.get("currentPassword") ?? ""), password);
      app.querySelector("#pwd-dialog")?.close();
      showToast("密码已更新，其他设备的登录已退出");
    } catch (error) {
      handleError(error);
    }
  }
}

async function saveTrip() {
  const form = state.form;
  const nodes = form.nodes.map(normalizeName).filter(Boolean);
  if (!nodes.length) {
    showToast("请先添加至少一个节点", "error");
    return;
  }
  const legs = form.legs.map((value, index) => ({
    from: nodes[index] ?? "",
    to: nodes[index + 1] ?? "",
    km: parseKmInput(value),
  }));

  const payload = {
    date: form.date,
    nodes,
    legs,
    totalKm: parseKmInput(form.total),
    note: form.note.trim(),
  };

  state.busy = true;
  render();
  try {
    const result = form.editingId ? await api.updateTrip(form.editingId, payload) : await api.createTrip(payload);
    upsertTrip(result.trip);
    state.form = createEmptyForm(form.date);
    state.query = "";
    showToast(`已保存：${formatDateLabel(result.trip.date)} · ${formatKm(result.trip.totalKm)} 公里`);
  } catch (error) {
    handleError(error);
  } finally {
    state.busy = false;
    render();
  }
}

function startEdit(tripId) {
  const trip = state.trips.find((item) => item.id === tripId);
  if (!trip) return;
  state.form = {
    date: trip.date,
    nodes: [...trip.nodes],
    legs: (trip.legs ?? []).map((leg) => (leg.km === null || leg.km === undefined ? "" : formatKm(leg.km))),
    total: trip.totalKm === null || trip.totalKm === undefined ? "" : formatKm(trip.totalKm),
    totalManual: true,
    suggestedTotal: trip.totalKm ?? null,
    note: trip.note ?? "",
    editingId: trip.id,
  };
  state.tab = "entry";
  state.focusNode = false;
  render();
  showToast("已载入表单，修改后点保存");
}

async function deleteTrip(tripId) {
  const trip = state.trips.find((item) => item.id === tripId);
  if (!trip) return;
  if (!window.confirm(`删除 ${formatDateLabel(trip.date)} 的这条行程？`)) return;
  try {
    await api.deleteTrip(tripId);
    removeTripLocal(tripId);
    showToast("已删除");
  } catch (error) {
    handleError(error);
  }
  render();
}

async function runImport() {
  const entries = (state.import.entries ?? []).filter((entry) => entry.checked);
  if (!entries.length) {
    showToast("请先勾选要导入的记录", "error");
    return;
  }
  state.import.busy = true;
  render();
  try {
    const payload = entries.map((entry) => ({
      date: entry.date,
      nodes: entry.nodes,
      legs: entry.nodes.slice(0, -1).map((from, index) => ({ from, to: entry.nodes[index + 1], km: null })),
      totalKm: entry.totalKm,
      note: null,
    }));
    const result = await api.bulkImport(payload);
    await loadTrips();
    state.import.entries = null;
    state.import.notes = [];
    showToast(`导入完成：新增 ${result.created} 条，跳过 ${result.skipped} 条`);
  } catch (error) {
    handleError(error);
  } finally {
    state.import.busy = false;
    render();
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify({ version: state.version, exportedAt: new Date().toISOString(), trips: state.trips }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `triptrace-${todayIso()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function logout() {
  try {
    await api.logout();
  } catch (error) {
    handleError(error);
  }
  state.user = null;
  state.trips = [];
  state.index = null;
  state.form = createEmptyForm();
  state.tab = "entry";
  state.phase = "auth";
  state.authMode = "login";
  render();
}

function onClick(event) {
  const target = event.target?.closest?.("[data-action]");
  if (!target) {
    let rerender = false;
    if (state.menuOpen && !event.target.closest?.(".menu-wrap")) {
      state.menuOpen = false;
      rerender = true;
    }
    if (state.query && !event.target.closest?.(".suggest-wrap")) {
      state.query = "";
      state.suggestActive = -1;
      state.suggestOpen = false;
      const input = app?.querySelector("#node-input");
      if (input) input.value = "";
      updateSuggestHost();
    }
    if (rerender) render();
    return;
  }
  const action = target.dataset.action;
  const form = state.form;

  switch (action) {
    case "auth-mode":
      state.authMode = target.dataset.mode === "register" ? "register" : "login";
      state.authError = "";
      render();
      return;
    case "tab":
      state.tab = target.dataset.tab ?? "entry";
      state.menuOpen = false;
      state.suggestOpen = false;
      render();
      return;
    case "toggle-menu":
      state.menuOpen = !state.menuOpen;
      render();
      return;
    case "open-password": {
      state.menuOpen = false;
      render();
      app.querySelector("#pwd-dialog")?.showModal();
      return;
    }
    case "close-password":
      app.querySelector("#pwd-dialog")?.close();
      return;
    case "export":
      state.menuOpen = false;
      render();
      exportData();
      return;
    case "logout":
      state.menuOpen = false;
      logout();
      return;
    case "date-shift":
      form.date = shiftDate(form.date, Number(target.dataset.days ?? "0"));
      render();
      return;
    case "date-today":
      form.date = todayIso();
      render();
      return;
    case "add-node": {
      const input = app.querySelector("#node-input");
      addNode(input?.value ?? "");
      return;
    }
    case "pick-suggestion": {
      const suggestions = currentSuggestions();
      const picked = suggestions[Number(target.dataset.index ?? "-1")];
      if (picked) addNode(picked.name);
      return;
    }
    case "remove-node":
      removeNode(Number(target.dataset.index ?? "-1"));
      return;
    case "undo-node":
      removeNode(form.nodes.length - 1);
      return;
    case "clear-chain":
      state.form = { ...createEmptyForm(form.date), note: form.note, date: form.date };
      state.query = "";
      render();
      return;
    case "use-leg-suggest": {
      const index = Number(target.dataset.index ?? "-1");
      const suggestion = legSuggestion(index);
      if (suggestion) {
        form.legs[index] = formatKm(suggestion.km);
        refreshTotal(form);
        render();
      }
      return;
    }
    case "apply-route": {
      applyRouteValues(findRoute(state.index, form.nodes), { force: true });
      render();
      return;
    }
    case "use-route": {
      const route = state.quickRoutes[Number(target.dataset.index ?? "-1")];
      if (route) {
        form.nodes = [...route.nodes];
        form.legs = route.nodes
          .slice(0, -1)
          .map((_, index) => {
            const km = route.legs?.[index]?.km;
            return km === null || km === undefined ? "" : formatKm(km);
          });
        applyRouteValues(route, { force: true });
        state.focusNode = true;
        render();
      }
      return;
    }
    case "auto-total":
      form.totalManual = false;
      refreshTotal(form);
      render();
      return;
    case "cancel-edit":
      state.form = createEmptyForm(state.form.date);
      state.query = "";
      render();
      return;
    case "save":
      saveTrip();
      return;
    case "edit-trip":
      startEdit(target.dataset.id ?? "");
      return;
    case "delete-trip":
      deleteTrip(target.dataset.id ?? "");
      return;
    case "stats-year": {
      state.statsYear += Number(target.dataset.delta ?? "0");
      render();
      return;
    }
    case "parse-import": {
      const parsed = parseRecords(state.import.text, state.import.year);
      state.import.entries = parsed.entries.map((entry) => ({ ...entry, checked: true }));
      state.import.notes = parsed.notes;
      state.import.error = parsed.entries.length ? "" : "没有解析到可导入的记录，请检查格式";
      render();
      return;
    }
    case "fill-sample":
      state.import.text = SAMPLE_TEXT;
      state.import.entries = null;
      state.import.notes = [];
      state.import.error = "";
      render();
      return;
    case "clear-import":
      state.import = { text: "", year: state.import.year, entries: null, notes: [], error: "", busy: false };
      render();
      return;
    case "select-all-import": {
      const value = target.dataset.value === "1";
      for (const entry of state.import.entries ?? []) entry.checked = value;
      render();
      return;
    }
    case "run-import":
      runImport();
      return;
    default:
      return;
  }
}

async function boot() {
  try {
    const me = await api.me();
    state.version = me.version ?? "";
    state.signupCodeRequired = Boolean(me.signupCodeRequired);
    if (me.user) {
      state.user = me.user;
      await loadTrips();
      state.phase = "ready";
    } else {
      state.phase = "auth";
    }
  } catch (error) {
    state.phase = "auth";
    state.authError = error?.message ?? "";
  }
  render();
}

app?.addEventListener("click", onClick);
app?.addEventListener("input", onInput);
app?.addEventListener("change", onChange);
app?.addEventListener("focusin", onFocusIn);
app?.addEventListener("keydown", onKeyDown);
app?.addEventListener("submit", onSubmit);

boot();
