import { useEffect, useMemo, useState } from "react";

import type { DesktopApi } from "../../api/desktop-api";
import type {
  PersonalReferenceCardDraft,
  RndReferenceCard,
  RndReferenceEvidenceType,
} from "../../api/rnd-reference-types";

interface RndReferenceLibraryProps {
  api: DesktopApi;
  focusCardIds: string[];
  open: boolean;
  onCardsChanged(cards: RndReferenceCard[]): void;
  onClose(): void;
}

const emptyDraft = (): PersonalReferenceCardDraft => ({
  title: "",
  parameterKey: "relative_sweetness",
  ingredientNames: [],
  specification: "",
  applicability: "",
  unit: "x_sucrose",
  basis: "sucrose_1",
  typicalValue: "",
  minimumValue: "",
  maximumValue: "",
  source: {
    title: "",
    publisher: "",
    url: null,
    publishedAt: null,
    locator: null,
    evidenceType: "personal_experience",
  },
});

export function RndReferenceLibrary({
  api,
  focusCardIds,
  open,
  onCardsChanged,
  onClose,
}: RndReferenceLibraryProps) {
  const [cards, setCards] = useState<RndReferenceCard[]>([]);
  const [query, setQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PersonalReferenceCardDraft>(emptyDraft);
  const [aliases, setAliases] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const focus = useMemo(() => new Set(focusCardIds), [focusCardIds]);

  useEffect(() => {
    if (open && focusCardIds.length > 0) setQuery("");
  }, [focusCardIds, open]);

  useEffect(() => {
    if (!open || focusCardIds.length === 0 || cards.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`rnd-reference-${focusCardIds[0]}`)
        ?.scrollIntoView?.({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [cards.length, focusCardIds, open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    void api
      .listRndReferenceCards(query, includeArchived)
      .then((next) => {
        if (!active) return;
        setCards(next);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "参考资料库读取失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, includeArchived, open, query]);

  if (!open) return null;

  async function refresh() {
    const [next, allApproved] = await Promise.all([
      api.listRndReferenceCards(query, includeArchived),
      api.listRndReferenceCards("", false),
    ]);
    setCards(next);
    onCardsChanged(allApproved);
  }

  function startCreate() {
    setEditingId("new");
    setDraft(emptyDraft());
    setAliases("");
    setError("");
  }

  function startEdit(card: RndReferenceCard) {
    if (card.origin !== "personal" || card.status === "archived") return;
    setEditingId(card.id);
    setAliases(card.ingredientNames.join("、"));
    setDraft({
      title: card.title,
      parameterKey: card.parameterKey,
      ingredientNames: [...card.ingredientNames],
      specification: card.specification,
      applicability: card.applicability,
      unit: card.unit,
      basis: card.basis,
      typicalValue: card.typicalValue,
      minimumValue: card.minimumValue,
      maximumValue: card.maximumValue,
      source: { ...card.source },
    });
    setError("");
  }

  async function saveCard() {
    if (editingId === null) return;
    setSaving(true);
    setError("");
    const input: PersonalReferenceCardDraft = {
      ...draft,
      ingredientNames: aliases
        .split(/[、,，\n]/)
        .map((value) => value.trim())
        .filter(Boolean),
      source: {
        ...draft.source,
        url: nullable(draft.source.url),
        publishedAt: nullable(draft.source.publishedAt),
        locator: nullable(draft.source.locator),
      },
    };
    try {
      if (editingId === "new") {
        await api.createPersonalRndReferenceCard(input);
      } else {
        await api.updatePersonalRndReferenceCard(editingId, input);
      }
      setEditingId(null);
      setDraft(emptyDraft());
      setAliases("");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "个人参考卡保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function archiveCard(card: RndReferenceCard) {
    if (
      card.origin !== "personal" ||
      !window.confirm(`归档个人参考卡“${card.title}”？`)
    ) {
      return;
    }
    setError("");
    try {
      await api.archivePersonalRndReferenceCard(card.id);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "个人参考卡归档失败");
    }
  }

  return (
    <div className="agent-reference-library" role="presentation">
      <section aria-label="研发参考资料库" aria-modal="true" role="dialog">
        <header>
          <div>
            <span>Agent 本地资料</span>
            <h3>研发参考资料库</h3>
            <small>当前收录甜度参考；内置卡只读，个人卡需确认后保存。</small>
          </div>
          <button aria-label="关闭研发参考资料库" onClick={onClose} type="button">
            ×
          </button>
        </header>

        <div className="agent-reference-library__toolbar">
          <input
            aria-label="搜索参考卡"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索原料、规格或适用条件"
            type="search"
            value={query}
          />
          <label>
            <input
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
              type="checkbox"
            />
            显示已归档
          </label>
          <button className="is-primary" onClick={startCreate} type="button">
            新建个人参考卡
          </button>
        </div>

        {editingId ? (
          <PersonalReferenceCardForm
            aliases={aliases}
            draft={draft}
            editing={editingId !== "new"}
            error={error}
            onAliasesChange={setAliases}
            onCancel={() => setEditingId(null)}
            onChange={setDraft}
            onSave={() => void saveCard()}
            saving={saving}
          />
        ) : null}

        {error && !editingId ? <p className="agent-reference-library__error" role="alert">{error}</p> : null}
        {loading ? <p className="agent-reference-library__loading">正在读取参考卡…</p> : null}
        {!loading && cards.length === 0 ? (
          <p className="agent-reference-library__loading">没有匹配的参考卡。</p>
        ) : null}
        <div className="agent-reference-library__list">
          {cards.map((card) => (
            <article
              className={`${focus.has(card.id) ? "is-focused" : ""}${card.status === "archived" ? " is-archived" : ""}`}
              id={`rnd-reference-${card.id}`}
              key={card.id}
            >
              <header>
                <div>
                  <span>{card.origin === "builtin" ? "内置已审核" : card.status === "archived" ? "个人 · 已归档" : "个人已确认"}</span>
                  <strong>{card.title}</strong>
                </div>
                <b>{card.typicalValue}×</b>
              </header>
              <p className="agent-reference-library__range">
                范围 {card.minimumValue}–{card.maximumValue}× 蔗糖
              </p>
              <dl>
                <div><dt>匹配名称</dt><dd>{card.ingredientNames.join("、")}</dd></div>
                <div><dt>规格条件</dt><dd>{card.specification}</dd></div>
                <div><dt>适用条件</dt><dd>{card.applicability}</dd></div>
                <div>
                  <dt>来源</dt>
                  <dd>
                    {card.source.url ? (
                      <a href={card.source.url} rel="noreferrer" target="_blank">
                        {card.source.title}
                      </a>
                    ) : card.source.title}
                    <small>{card.source.publisher} · {evidenceLabel(card.source.evidenceType)}</small>
                  </dd>
                </div>
              </dl>
              {card.origin === "personal" && card.status !== "archived" ? (
                <footer>
                  <button onClick={() => startEdit(card)} type="button">编辑</button>
                  <button onClick={() => void archiveCard(card)} type="button">归档</button>
                </footer>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function PersonalReferenceCardForm({
  aliases,
  draft,
  editing,
  error,
  onAliasesChange,
  onCancel,
  onChange,
  onSave,
  saving,
}: {
  aliases: string;
  draft: PersonalReferenceCardDraft;
  editing: boolean;
  error: string;
  onAliasesChange(value: string): void;
  onCancel(): void;
  onChange(value: PersonalReferenceCardDraft): void;
  onSave(): void;
  saving: boolean;
}) {
  const setSource = <K extends keyof PersonalReferenceCardDraft["source"]>(
    key: K,
    value: PersonalReferenceCardDraft["source"][K],
  ) => onChange({ ...draft, source: { ...draft.source, [key]: value } });
  return (
    <div className="agent-reference-form">
      <header>
        <strong>{editing ? "编辑个人参考卡" : "确认并保存个人参考卡"}</strong>
        <small>保存前请确认来源、适用条件和数值；个人经验会明确标注。</small>
      </header>
      <div className="agent-reference-form__grid">
        <label><span>卡片名称</span><input onChange={(event) => onChange({ ...draft, title: event.target.value })} value={draft.title} /></label>
        <label><span>原料名称/别名</span><input onChange={(event) => onAliasesChange(event.target.value)} placeholder="用顿号或逗号分隔" value={aliases} /></label>
        <label className="is-wide"><span>规格匹配条件</span><input onChange={(event) => onChange({ ...draft, specification: event.target.value })} value={draft.specification} /></label>
        <label className="is-wide"><span>适用条件</span><textarea onChange={(event) => onChange({ ...draft, applicability: event.target.value })} rows={2} value={draft.applicability} /></label>
        <label><span>中心值（×蔗糖）</span><input inputMode="decimal" onChange={(event) => onChange({ ...draft, typicalValue: event.target.value })} value={draft.typicalValue} /></label>
        <label><span>最小值</span><input inputMode="decimal" onChange={(event) => onChange({ ...draft, minimumValue: event.target.value })} value={draft.minimumValue} /></label>
        <label><span>最大值</span><input inputMode="decimal" onChange={(event) => onChange({ ...draft, maximumValue: event.target.value })} value={draft.maximumValue} /></label>
        <label><span>证据类型</span><select onChange={(event) => setSource("evidenceType", event.target.value as RndReferenceEvidenceType)} value={draft.source.evidenceType}><option value="personal_experience">个人经验</option><option value="supplier_document">供应商资料</option><option value="peer_reviewed_review">同行评审文献</option><option value="regulatory_agency">监管机构</option></select></label>
        <label><span>来源标题</span><input onChange={(event) => setSource("title", event.target.value)} value={draft.source.title} /></label>
        <label><span>发布者/资料提供方</span><input onChange={(event) => setSource("publisher", event.target.value)} value={draft.source.publisher} /></label>
        <label className="is-wide"><span>来源网址（可空）</span><input onChange={(event) => setSource("url", event.target.value)} value={draft.source.url ?? ""} /></label>
        <label><span>发布日期（可空）</span><input onChange={(event) => setSource("publishedAt", event.target.value)} value={draft.source.publishedAt ?? ""} /></label>
        <label><span>页码/表格定位（可空）</span><input onChange={(event) => setSource("locator", event.target.value)} value={draft.source.locator ?? ""} /></label>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <footer>
        <button disabled={saving} onClick={onCancel} type="button">取消</button>
        <button className="is-primary" disabled={saving} onClick={onSave} type="button">{saving ? "正在保存…" : "确认来源与数值并保存"}</button>
      </footer>
    </div>
  );
}

function nullable(value: string | null) {
  const normalized = value?.trim() ?? "";
  return normalized === "" ? null : normalized;
}

function evidenceLabel(value: RndReferenceEvidenceType) {
  if (value === "regulatory_agency") return "监管机构";
  if (value === "peer_reviewed_review") return "同行评审文献";
  if (value === "supplier_document") return "供应商资料";
  return "个人经验";
}
