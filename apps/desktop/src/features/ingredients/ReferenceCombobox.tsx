import { useEffect, useId, useMemo, useState } from "react";

import { DesktopApiError } from "../../api/types";

interface ReferenceItem {
  id: string;
  name: string;
}

interface ReferenceComboboxProps<T extends ReferenceItem> {
  createItem: (name: string) => Promise<T>;
  label: string;
  loadItems: () => Promise<T[]>;
  noun: string;
  onChange: (id: string | null) => void;
  optional?: boolean;
  value: string | null;
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

export function ReferenceCombobox<T extends ReferenceItem>({
  createItem,
  label,
  loadItems,
  noun,
  onChange,
  optional = false,
  value,
}: ReferenceComboboxProps<T>) {
  const inputId = useId();
  const listboxId = useId();
  const [items, setItems] = useState<T[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadItems()
      .then((loaded) => {
        if (!active) return;
        setItems(loaded);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : `${noun}加载失败`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadItems, noun]);

  const selected = items.find((item) => item.id === value) ?? null;
  const visibleItems = useMemo(() => {
    const needle = normalized(query);
    if (needle === "" || selected?.name === query) return items;
    return items.filter((item) => normalized(item.name).includes(needle));
  }, [items, query, selected?.name]);
  const trimmedQuery = query.trim();
  const exactMatch = items.some(
    (item) => normalized(item.name) === normalized(trimmedQuery),
  );
  const canCreate = trimmedQuery !== "" && !exactMatch && !loading;

  useEffect(() => {
    if (!open && selected !== null) setQuery(selected.name);
  }, [open, selected]);

  function select(item: T) {
    setQuery(item.name);
    setError(null);
    setOpen(false);
    setActiveIndex(-1);
    onChange(item.id);
  }

  function clearSelection() {
    setQuery("");
    setError(null);
    setActiveIndex(-1);
    onChange(null);
  }

  async function create() {
    if (!canCreate) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createItem(trimmedQuery);
      setItems((current) => [...current, created]);
      select(created);
    } catch (cause) {
      if (cause instanceof DesktopApiError && cause.code === "duplicate_name") {
        setError(`${noun}名称已存在，请从列表中选择`);
      } else {
        setError(cause instanceof Error ? cause.message : `${noun}创建失败`);
      }
    } finally {
      setCreating(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      setQuery(selected?.name ?? "");
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        visibleItems.length === 0 ? -1 : (current + 1) % visibleItems.length,
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        visibleItems.length === 0
          ? -1
          : (current - 1 + visibleItems.length) % visibleItems.length,
      );
      return;
    }
    if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      const item = visibleItems[activeIndex];
      if (item !== undefined) select(item);
    }
  }

  const activeOption =
    activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined;

  return (
    <div className="field field--full reference-field">
      <label htmlFor={inputId}>
        {label}
        {optional ? <small aria-hidden="true">（可选）</small> : null}
      </label>
      <div className="reference-combobox">
        <input
          aria-activedescendant={activeOption}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          autoComplete="off"
          id={inputId}
          onBlur={() => {
            setOpen(false);
            setActiveIndex(-1);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setError(null);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={`搜索或创建${noun}`}
          role="combobox"
          value={query}
        />
        {value !== null && optional ? (
          <button
            aria-label={`清除${label}`}
            className="reference-clear"
            onClick={clearSelection}
            type="button"
          >
            清除
          </button>
        ) : null}
        {open ? (
          <div className="reference-popover">
            <div aria-label={`${label}选项`} id={listboxId} role="listbox">
              {loading ? (
                <div className="reference-state">正在加载…</div>
              ) : null}
              {!loading && visibleItems.length === 0 ? (
                <div className="reference-state">没有匹配的{noun}</div>
              ) : null}
              {visibleItems.map((item, index) => (
                <button
                  aria-selected={item.id === value}
                  className={
                    index === activeIndex
                      ? "reference-option is-active"
                      : "reference-option"
                  }
                  id={`${listboxId}-option-${index}`}
                  key={item.id}
                  onClick={() => select(item)}
                  onMouseDown={(event) => event.preventDefault()}
                  role="option"
                  type="button"
                >
                  {item.name}
                </button>
              ))}
            </div>
            {canCreate ? (
              <button
                aria-label={`创建${noun} ${trimmedQuery}`}
                className="reference-create"
                disabled={creating}
                onClick={() => void create()}
                onMouseDown={(event) => event.preventDefault()}
                type="button"
              >
                {creating ? "正在创建…" : `+ 创建“${trimmedQuery}”`}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {error !== null ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
