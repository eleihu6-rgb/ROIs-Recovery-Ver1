import type { InputHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
};
