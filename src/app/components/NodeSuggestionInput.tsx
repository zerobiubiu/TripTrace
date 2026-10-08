import { useState } from "react";
import type { NodeSuggestion } from "../lib/suggest";

interface NodeSuggestionInputProps {
  query: string;
  suggestions: NodeSuggestion[];
  activeIndex: number;
  onQueryChange: (value: string) => void;
  onActiveIndexChange: (index: number) => void;
  onPick: (name: string) => void;
}

/** 节点名输入框 + 历史建议下拉（键盘 ↑↓ 选择、回车添加、Esc 收起）。 */
export function NodeSuggestionInput({
  query,
  suggestions,
  activeIndex,
  onQueryChange,
  onActiveIndexChange,
  onPick,
}: NodeSuggestionInputProps) {
  const [open, setOpen] = useState(false);

  const pick = (name: string) => {
    setOpen(false);
    onActiveIndexChange(-1);
    onPick(name);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      onActiveIndexChange((activeIndex + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setOpen(true);
      onActiveIndexChange((activeIndex - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      onQueryChange("");
      onActiveIndexChange(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const picked = activeIndex >= 0 ? suggestions[activeIndex] : undefined;
      pick(picked?.name ?? query);
    }
  };

  return (
    <div className="suggest-wrap">
      <input
        className="input"
        id="node-input"
        value={query}
        placeholder="输入节点名称，回车添加"
        autoComplete="off"
        enterKeyHint="done"
        onChange={(event) => {
          setOpen(true);
          onActiveIndexChange(-1);
          onQueryChange(event.target.value);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={handleKeyDown}
      />
      {open && suggestions.length > 0 ? (
        <div className="suggest" role="listbox">
          {suggestions.map((entry, index) => (
            <button
              key={entry.name}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "suggest-item is-active" : "suggest-item"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(entry.name)}
            >
              <span>{entry.name}</span>
              <span className="hint">用过 {entry.count} 次</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
