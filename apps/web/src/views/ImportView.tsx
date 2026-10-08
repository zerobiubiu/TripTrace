import { useState } from "react";
import { chainText, formatDateLabel, formatKm } from "../lib/format";
import { parseRecords } from "../lib/importText";
import { SAMPLE_TEXT } from "../lib/sampleText";
import type { ImportEntry, TripPayload } from "../types";

interface ImportViewProps {
  onImport: (trips: TripPayload[]) => Promise<{ created: number; skipped: number }>;
  notify: (text: string, kind?: "info" | "error") => void;
}

export function ImportView({ onImport, notify }: ImportViewProps) {
  const [text, setText] = useState("");
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [entries, setEntries] = useState<ImportEntry[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const checkedCount = entries?.filter((entry) => entry.checked).length ?? 0;

  const handleParse = () => {
    const parsed = parseRecords(text, year);
    setEntries(parsed.entries.map((entry) => ({ ...entry, checked: true })));
    setNotes(parsed.notes);
    setError(parsed.entries.length ? "" : "没有解析到可导入的记录，请检查格式");
  };

  const handleImport = async () => {
    const selected = (entries ?? []).filter((entry) => entry.checked);
    if (selected.length === 0) {
      notify("请先勾选要导入的记录", "error");
      return;
    }
    setBusy(true);
    try {
      const result = await onImport(
        selected.map((entry) => ({
          date: entry.date,
          nodes: entry.nodes,
          legs: entry.nodes
            .slice(0, -1)
            .map((from, index) => ({ from, to: entry.nodes[index + 1] ?? "", km: null })),
          totalKm: entry.totalKm,
          note: "",
        })),
      );
      setEntries(null);
      setNotes([]);
      notify(`导入完成：新增 ${result.created} 条，跳过 ${result.skipped} 条`);
    } catch (importError) {
      notify(importError instanceof Error ? importError.message : "导入失败", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="import-grid">
        <section className="card">
          <p className="card-title">导入历史文本</p>
          <p className="small muted">支持“日期 + 节点链 + 里程”的文本记录：只写日期、只写节点、写总里程都可以。</p>
          <div className="field">
            <textarea
              className="input"
              rows={12}
              placeholder={"例如：\n9.28\n家，依剑，爱克森，圣润  57 公里"}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </div>
          <div className="row wrap">
            <label className="small muted" htmlFor="import-year">
              年份
            </label>
            <input
              id="import-year"
              className="input is-compact"
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(event) => setYear(Number.parseInt(event.target.value, 10) || year)}
            />
            <button type="button" className="btn btn-sm" onClick={handleParse}>
              解析预览
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setText(SAMPLE_TEXT);
                setEntries(null);
                setNotes([]);
                setError("");
              }}
            >
              填入示例
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => {
                setText("");
                setEntries(null);
                setNotes([]);
                setError("");
              }}
            >
              清空
            </button>
          </div>
          {error ? <p className="hint-line">{error}</p> : null}
        </section>

        <aside>
          {notes.length > 0 ? (
            <section className="card">
              <p className="card-title">解析说明</p>
              <div className="list">
                {notes.map((note) => (
                  <div className="small muted" key={note}>
                    · {note}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {entries ? (
            <section className="card">
              <div className="row-between">
                <p className="card-title">
                  解析结果（{entries.length} 条，已选 {checkedCount} 条）
                </p>
                <div className="row">
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setEntries((current) => current?.map((entry) => ({ ...entry, checked: true })) ?? null)}
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() =>
                      setEntries((current) => current?.map((entry) => ({ ...entry, checked: false })) ?? null)
                    }
                  >
                    全不选
                  </button>
                </div>
              </div>
              <div className="list">
                {entries.map((entry, index) => (
                  <label className="check-row" key={`${entry.date}-${entry.nodes.join("-")}-${index}`}>
                    <input
                      type="checkbox"
                      checked={entry.checked}
                      onChange={(event) =>
                        setEntries(
                          (current) =>
                            current?.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, checked: event.target.checked } : item,
                            ) ?? null,
                        )
                      }
                    />
                    <span className="check-body">
                      <span className="check-title">
                        {formatDateLabel(entry.date)} · {chainText(entry.nodes)}
                      </span>
                      <span className="tiny muted">
                        {" "}
                        · {entry.totalKm === null ? "未填里程" : `${formatKm(entry.totalKm)} 公里`}
                      </span>
                      {entry.hint ? <div className="tiny muted">{entry.hint}</div> : null}
                    </span>
                  </label>
                ))}
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={checkedCount === 0 || busy}
                  onClick={handleImport}
                >
                  {busy ? "导入中…" : `导入选中的 ${checkedCount} 条`}
                </button>
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
