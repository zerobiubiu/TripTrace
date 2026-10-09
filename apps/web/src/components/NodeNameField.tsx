import { useMemo, useState } from "react";
import { IconButton, InputAdornment, Stack, TextField, Tooltip, Typography } from "@mui/material";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import KeyboardAltRoundedIcon from "@mui/icons-material/KeyboardAltRounded";
import Autocomplete from "@mui/material/Autocomplete";

interface NodeNameFieldProps {
  value: string;
  /**
   * 按查询词取候选（父层负责「匹配相关性 + 使用频率」的排序）。
   * **选择态传空串**（要的是「常用节点」全量榜），输入态才传输入值——这是「先选后输」的关键。
   */
  optionsFor: (query: string) => string[];
  ariaLabel: string;
  placeholder?: string;
  error?: boolean;
  helperText?: string;
  onValueChange: (name: string) => void;
}

/**
 * 节点名控件：**移动端先选、再输入**。
 *
 * - 默认「选择态」：输入框 `readOnly`（外加 `inputMode: none`），点一下展开候选列表，**不唤起软键盘**；选中即完成。
 * - 右侧键盘图标是**明确的输入入口**（Tooltip「手动输入」）：点了才进入输入态、才允许敲键盘。
 * - 候选为空（还没有历史）时，点开即直接进输入态——没有可选项就不该拦着用户打字。
 * - 输入态下候选按「模糊匹配 + 使用频率」实时刷新；弹层带 `flip` + `preventOverflow`（各留 8px），
 *   下方空间不够时向上展开，不盖住正在输入的字段；点击外部由 Autocomplete 关闭。
 * - 候选顺序只表示「常用程度」，**与路线实际顺序无关**（顺序由节点数组位置决定）。
 */
export function NodeNameField({
  value,
  optionsFor,
  ariaLabel,
  placeholder,
  error,
  helperText,
  onValueChange,
}: NodeNameFieldProps) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);

  // 选择态给「常用节点」全量榜（按使用频率），输入态给「当前输入的模糊匹配结果」
  const options = useMemo(() => optionsFor(editing ? value : ""), [optionsFor, editing, value]);

  return (
    <Autocomplete
      freeSolo
      autoHighlight
      open={open}
      onOpen={() => {
        if (!editing && options.length === 0) setEditing(true);
        setOpen(true);
      }}
      onClose={() => setOpen(false)}
      options={options}
      filterOptions={(items) => items}
      inputValue={value}
      value={null}
      onInputChange={(_event, next, reason) => {
        if (reason === "input" || reason === "clear") onValueChange(next);
      }}
      onChange={(_event, next) => {
        if (typeof next === "string") {
          onValueChange(next);
          setEditing(false); // 选完回到选择态：不唤起键盘
        }
      }}
      getOptionLabel={(option) => option}
      renderOption={(props, option) => {
        const { key, ...rest } = props as typeof props & { key: React.Key };
        return (
          <Stack component="li" key={key} {...rest} direction="row" sx={{ alignItems: "center", gap: 1 }}>
            <Typography variant="body2">{option}</Typography>
          </Stack>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder={editing ? placeholder : undefined}
          error={error}
          helperText={helperText}
          slotProps={{
            ...params.slotProps,
            htmlInput: {
              ...params.slotProps.htmlInput,
              readOnly: !editing,
              "aria-label": ariaLabel,
              maxLength: 40,
              ...(editing ? {} : { inputMode: "none" as const }),
            },
            input: {
              ...params.slotProps.input,
              readOnly: !editing,
              endAdornment: (
                <>
                  <InputAdornment position="end" sx={{ ml: 0 }}>
                    <Tooltip title={editing ? "从常用节点里选" : "手动输入"}>
                      <IconButton
                        aria-label={editing ? "从常用节点里选" : "手动输入节点名"}
                        // 别把焦点从输入框抢走：否则列表会因失焦关闭
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setEditing((current) => !current);
                          setOpen(true);
                        }}
                        sx={{ color: "text.secondary" }}
                      >
                        {editing ? <ExpandMoreRoundedIcon /> : <KeyboardAltRoundedIcon />}
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                  {params.slotProps.input?.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
      slotProps={{
        popper: {
          placement: "bottom-start",
          popperOptions: {
            modifiers: [
              { name: "flip", options: { padding: 8 } },
              { name: "preventOverflow", options: { padding: 8 } },
            ],
          },
        },
        // 高度上限跟着**视口**走，不是写死的 264px：软键盘弹出后可视区只剩三四百像素时，
        // 固定上限会让列表顶出屏幕（实测溢出 6px，MUI 的 40vh 上限加上纸面内边距刚好越界）。
        paper: { sx: { maxHeight: "min(264px, 34vh)" } },
      }}
      sx={{ flex: 1, minWidth: 0 }}
    />
  );
}