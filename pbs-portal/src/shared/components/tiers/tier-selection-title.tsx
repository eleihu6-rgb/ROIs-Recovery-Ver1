import { cn } from "@/shared/lib/cn";

type TierSelectionTitleProps = {
  as?: "legend" | "p";
  className?: string;
  required?: boolean;
};

export const TierSelectionTitle = ({
  as = "p",
  className,
  required = false,
}: TierSelectionTitleProps) => {
  const content = (
    <>
      APPLY TO TIERS
      {required ? <> <span className="text-destructive">· REQUIRED</span></> : null}
    </>
  );
  const titleClassName = cn(
    "m-0 text-xs font-bold uppercase leading-4 tracking-wide text-muted-foreground",
    className,
  );

  return as === "legend"
    ? <legend className={titleClassName}>{content}</legend>
    : <p className={titleClassName}>{content}</p>;
};
