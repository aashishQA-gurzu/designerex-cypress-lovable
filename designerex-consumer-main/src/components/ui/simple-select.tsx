import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SimpleSelectOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

/**
 * Cross-platform replacement for a native <select>.
 *
 * Native selects render with the operating system's own control, so the same
 * page looks different on Windows, macOS and various OEM builds. This wraps the
 * Radix-based Select so every dropdown in the app looks and behaves the same.
 *
 * Radix cannot hold an empty-string item value, so "" (the usual "no choice"
 * value of a native select) is mapped to a private sentinel internally.
 */
const EMPTY = "__simple_select_empty__";

export function SimpleSelect({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  contentClassName,
  disabled,
  id,
  name,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-invalid": ariaInvalid,
}: {
  value: string | null | undefined;
  onValueChange: (value: string) => void;
  options: SimpleSelectOption[];
  placeholder?: string;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-invalid"?: boolean;
}) {
  const isEmpty = value == null || value === "";
  const hasEmptyOption = options.some((o) => o.value === "");
  // Without an explicit "no choice" option, leave the value unset so the
  // placeholder shows, mirroring a native select with an empty first option.
  const current = isEmpty ? (hasEmptyOption ? EMPTY : undefined) : value;

  return (
    <Select
      value={current}
      disabled={disabled}
      name={name}
      onValueChange={(v) => onValueChange(v === EMPTY ? "" : v)}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-invalid={ariaInvalid}
        className={cn("w-full bg-white text-left", className)}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={cn("z-[60] max-h-72", contentClassName)}>
        {options.map((o) => (
          <SelectItem
            key={o.value === "" ? EMPTY : o.value}
            value={o.value === "" ? EMPTY : o.value}
            disabled={o.disabled}
          >
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
