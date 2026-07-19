import type { IngredientSourceAttachment } from "../../api/types";

interface SourceAttachmentListProps {
  attachments: IngredientSourceAttachment[];
}

function formatSize(byteSize: number) {
  if (byteSize < 1024) return `${byteSize} B`;
  if (byteSize < 1024 * 1024) return `${(byteSize / 1024).toFixed(1)} KB`;
  return `${(byteSize / 1024 / 1024).toFixed(1)} MB`;
}

export function SourceAttachmentList({ attachments }: SourceAttachmentListProps) {
  if (attachments.length === 0) return null;
  return (
    <section className="source-attachments field--full" aria-label="来源附件">
      <h4>来源附件</h4>
      <div className="source-attachment-list">
        {attachments.map((attachment) => (
          <span className="source-attachment-chip" key={attachment.id}>
            <strong>{attachment.originalName}</strong>
            <small>{attachment.mediaType} · {formatSize(attachment.byteSize)}</small>
          </span>
        ))}
      </div>
      <p>原始文件仅作为追溯依据，不会显示本机路径。</p>
    </section>
  );
}
