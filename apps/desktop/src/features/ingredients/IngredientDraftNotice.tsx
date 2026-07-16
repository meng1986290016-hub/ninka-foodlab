interface IngredientDraftNoticeProps {
  onDiscard: () => void;
  onRestore: () => void;
}

export function IngredientDraftNotice({
  onDiscard,
  onRestore,
}: IngredientDraftNoticeProps) {
  return (
    <div className="draft-notice">
      <div>
        <strong>发现未完成的供应商版本草稿</strong>
        <span>草稿不会自动覆盖当前表单。</span>
      </div>
      <div className="draft-notice__actions">
        <button onClick={onDiscard} type="button">
          丢弃草稿
        </button>
        <button onClick={onRestore} type="button">
          恢复草稿
        </button>
      </div>
    </div>
  );
}
