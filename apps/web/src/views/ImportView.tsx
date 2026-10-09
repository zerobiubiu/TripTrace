import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { chainText, formatDateLabel, formatKm } from "../lib/format";
import { parseRecords } from "../lib/importText";
import { SAMPLE_TEXT } from "../lib/sampleText";
import type { ImportEntry, TripPayload } from "../types";

interface ImportViewProps {
  onImport: (trips: TripPayload[]) => Promise<{ created: number; skipped: number }>;
  notify: (text: string, kind?: "info" | "error") => void;
  /** 已有记录的键集合：`${date}|${nodes.join("\u0001")}`（同日同链）。 */
  existing: Set<string>;
}

export function ImportView({ onImport, notify, existing }: ImportViewProps) {
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

  /** 清空预览结果（保留输入文本）。 */
  const resetPreview = () => {
    setEntries(null);
    setNotes([]);
    setError("");
  };

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "minmax(0, 1.1fr) minmax(0, 1fr)" },
        gap: 1.5,
        alignItems: "start",
      }}
    >
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={1.5}>
            <Typography variant="h3" component="h3">
              导入历史文本
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              支持“日期 + 节点链 + 里程”的文本记录：只写日期、只写节点、写总里程都可以。
            </Typography>
            <TextField
              label="历史记录文本"
              multiline
              minRows={12}
              fullWidth
              placeholder={"例如：\n9.28\n家，依剑，爱克森，圣润  57 公里"}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <Stack direction="row" useFlexGap spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
              <TextField
                label="年份"
                type="number"
                size="small"
                value={year}
                onChange={(event) => setYear(Number.parseInt(event.target.value, 10) || year)}
                slotProps={{ htmlInput: { min: 2000, max: 2100, inputMode: "numeric" } }}
                sx={{ width: 96 }}
              />
              <Button variant="contained" onClick={handleParse}>
                解析预览
              </Button>
              <Button
                variant="outlined"
                onClick={() => {
                  setText(SAMPLE_TEXT);
                  resetPreview();
                }}
              >
                填入示例
              </Button>
              <Button
                variant="text"
                onClick={() => {
                  setText("");
                  resetPreview();
                }}
              >
                清空
              </Button>
            </Stack>
            {error ? <Alert severity="error">{error}</Alert> : null}
          </Stack>
        </CardContent>
      </Card>

      <Stack spacing={1.5}>
        {notes.length > 0 ? (
          <Alert severity="info" sx={{ alignItems: "flex-start" }}>
            <Typography variant="h3" component="h3">
              解析说明
            </Typography>
            <Stack spacing={0.25} sx={{ mt: 0.5 }}>
              {notes.map((note) => (
                <Typography variant="caption" key={note}>
                  · {note}
                </Typography>
              ))}
            </Stack>
          </Alert>
        ) : null}

        {entries ? (
          <Card variant="outlined">
            <CardContent>
              <Stack spacing={1.5}>
                <Stack
                  direction="row"
                  useFlexGap
                  spacing={1}
                  sx={{ alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
                >
                  <Typography variant="h3" component="h3">
                    解析结果（
                    <Box component="span" aria-live="polite">
                      {entries.length} 条，已选 {checkedCount} 条
                    </Box>
                    ）
                  </Typography>
                  <Stack direction="row" sx={{ columnGap: 0.5 }}>
                    <Button
                      size="small"
                      onClick={() => setEntries((current) => current?.map((entry) => ({ ...entry, checked: true })) ?? null)}
                    >
                      全选
                    </Button>
                    <Button
                      size="small"
                      onClick={() => setEntries((current) => current?.map((entry) => ({ ...entry, checked: false })) ?? null)}
                    >
                      全不选
                    </Button>
                  </Stack>
                </Stack>

                <Stack spacing={0} divider={<Divider flexItem />}>
                  {entries.map((entry, index) => (
                    <FormControlLabel
                      key={`${entry.date}-${entry.nodes.join("-")}-${index}`}
                      control={
                        <Checkbox
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
                      }
                      label={
                        <Stack component="span" sx={{ display: "block", py: 0.75 }}>
                          <Typography
                            component="span"
                            variant="body2"
                            sx={{ display: "block", fontWeight: 600, overflowWrap: "anywhere" }}
                          >
                            {formatDateLabel(entry.date)} · {chainText(entry.nodes)}
                          </Typography>
                          <Stack
                            component="span"
                            direction="row"
                            useFlexGap
                            spacing={1}
                            sx={{ alignItems: "center", flexWrap: "wrap", mt: 0.25 }}
                          >
                            <Typography component="span" variant="caption" sx={{ color: "text.secondary" }}>
                              {entry.totalKm === null ? "未填里程" : `${formatKm(entry.totalKm)} 公里`}
                            </Typography>
                            {/* 键与 App 的 existing 约定一致：`${date}|${nodes.join("\u0001")}` */}
                            {existing.has(`${entry.date}|${entry.nodes.join("\u0001")}`) ? (
                              <Chip component="span" size="small" color="warning" label="同日同链已有记录" />
                            ) : null}
                          </Stack>
                          {entry.hint ? (
                            <Typography
                              component="span"
                              variant="caption"
                              sx={{ display: "block", color: "text.secondary" }}
                            >
                              {entry.hint}
                            </Typography>
                          ) : null}
                        </Stack>
                      }
                      sx={{
                        alignItems: "flex-start",
                        width: "100%",
                        margin: 0,
                        columnGap: 0.5,
                        "& .MuiFormControlLabel-label": { flex: 1, minWidth: 0 },
                      }}
                    />
                  ))}
                </Stack>

                <Button
                  variant="contained"
                  disabled={checkedCount === 0 || busy}
                  onClick={handleImport}
                  sx={{ alignSelf: "flex-start" }}
                >
                  {busy ? "导入中…" : `导入选中的 ${checkedCount} 条`}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        ) : null}
      </Stack>
    </Box>
  );
}
