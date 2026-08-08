import type { AgentRecipeProposal } from "../../api/agent-recipe-types";
import { Icon } from "../../components/Icon";

interface AgentRecipeProposalListProps {
  busy: boolean;
  proposals: AgentRecipeProposal[];
  onDiscard(proposal: AgentRecipeProposal): void;
  onOpen(proposal: AgentRecipeProposal): void;
  onOpenAccepted(recipeId: string): void;
}

export function AgentRecipeProposalList({
  busy,
  proposals,
  onDiscard,
  onOpen,
  onOpenAccepted,
}: AgentRecipeProposalListProps) {
  if (proposals.length === 0) return null;
  return (
    <section className="agent-proposal-list" aria-label="配方提案">
      <header>
        <strong>配方提案</strong>
        <span>{proposals.length}</span>
      </header>
      {proposals.map((proposal) => {
        const calculation = proposal.evaluation.calculation;
        const matched = proposal.payload.items.filter(
          (item) => item.kind === "ingredient",
        ).length;
        const missing = proposal.payload.items.length - matched;
        return (
          <article className="agent-proposal-card" key={proposal.id}>
            <div className="agent-proposal-card__heading">
              <span>
                {proposal.payload.mode === "goal_design"
                  ? "产品设计"
                  : "标签逆向"}
              </span>
              <small>{statusLabel(proposal.status)}</small>
            </div>
            <h3>{proposal.payload.productName}</h3>
            <dl className="agent-proposal-card__metrics">
              <div>
                <dt>批次成本</dt>
                <dd>¥{display(calculation.cost.batchTotal)}</dd>
              </div>
              <div>
                <dt>数据完整度</dt>
                <dd>{calculation.completeness.percent}%</dd>
              </div>
              <div>
                <dt>匹配原料</dt>
                <dd>
                  {matched}/{proposal.payload.items.length}
                </dd>
              </div>
            </dl>
            {missing > 0 ? <p>{missing} 项原料仍待补充</p> : null}
            {proposal.payload.yieldAssumption === "assumed_100_percent" ? (
              <p className="agent-proposal-card__warning">
                <Icon name="warning" size={14} />
                得率未知，当前暂按 100% 试算
              </p>
            ) : null}
            <footer>
              {proposal.status === "pending_review" ? (
                <>
                  <button
                    className="button button--secondary"
                    disabled={busy}
                    onClick={() => onDiscard(proposal)}
                    type="button"
                  >
                    放弃
                  </button>
                  <button
                    className="button button--primary"
                    disabled={busy}
                    onClick={() => onOpen(proposal)}
                    type="button"
                  >
                    查看完整提案
                  </button>
                </>
              ) : proposal.status === "accepted" && proposal.acceptedRecipeId ? (
                <button
                  className="button button--secondary"
                  onClick={() => onOpenAccepted(proposal.acceptedRecipeId!)}
                  type="button"
                >
                  打开工作草稿
                </button>
              ) : null}
            </footer>
          </article>
        );
      })}
    </section>
  );
}

function statusLabel(status: AgentRecipeProposal["status"]) {
  if (status === "pending_review") return "待人工复核";
  if (status === "accepted") return "已创建草稿";
  return "已放弃";
}

function display(value: string) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : "—";
}
