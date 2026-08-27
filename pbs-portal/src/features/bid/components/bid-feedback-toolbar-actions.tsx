import { useState } from "react";
import { BidFeedbackDialog } from "@/features/bid/components/bid-feedback-dialog";
import { useBidFeedback } from "@/features/bid/hooks/use-bid-feedback";

export const BidFeedbackToolbarActions = ({ draftVersionKey }: { draftVersionKey: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const feedbackQuery = useBidFeedback(isOpen, draftVersionKey);

  return (
    <>
      <button
        aria-label="Bid Feedback"
        className="relative inline-flex h-[30px] cursor-pointer items-center justify-center overflow-visible rounded-lg border border-[#e3b94f] bg-[#fff7dd] px-[14px] text-xs font-semibold uppercase text-[#705616] transition-colors hover:bg-[#fff0bf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="bid-feedback-toolbar-button"
        type="button"
        onClick={() => setIsOpen(true)}
      >
        <span data-testid="bid-feedback-toolbar-label">Feedback</span>
      </button>
      {isOpen ? (
        <BidFeedbackDialog
          data={feedbackQuery.data}
          isError={feedbackQuery.isError}
          isLoading={feedbackQuery.isLoading}
          onClose={() => setIsOpen(false)}
          onRetry={() => void feedbackQuery.refetch()}
        />
      ) : null}
    </>
  );
};
