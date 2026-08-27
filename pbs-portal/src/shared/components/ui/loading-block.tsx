import { cn } from "@/shared/lib/cn";

type LoadingBlockProps = {
  className?: string;
};

export const LoadingBlock = ({ className }: LoadingBlockProps) => (
  <div
    aria-hidden="true"
    className={cn("animate-pulse rounded-lg bg-[#edf1f6]", className)}
  />
);
