import type { HTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn("rounded-lg border border-border bg-card text-card-foreground shadow-sm", className)} {...props} />;
};

export const CardHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
};

export const CardTitle = ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => {
  return <h2 className={cn("text-lg font-semibold tracking-tight", className)} {...props} />;
};

export const CardContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
};
