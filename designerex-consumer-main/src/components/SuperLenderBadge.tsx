import { Crown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function SuperLenderBadge({
  active,
  size = "md",
  className,
}: {
  active?: boolean | null;
  size?: "sm" | "md";
  className?: string;
}) {
  if (!active) return null;
  const sizing =
    size === "sm"
      ? "px-2 py-0.5 text-[10px] gap-1"
      : "px-2.5 py-1 text-[11px] gap-1";
  const iconSize = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex max-w-full items-center rounded-full bg-magenta font-medium text-white",
              sizing,
              className,
            )}
          >
            <Crown className={cn(iconSize, "fill-current")} />
            <span className="truncate">Super Lender</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>Top-performing lender on Designerex</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
