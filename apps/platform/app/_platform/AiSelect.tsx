"use client";

import { Check, ChevronDown } from "lucide-react";
import { KeyboardEvent, useEffect, useId, useRef, useState } from "react";

export type AiSelectOption<T extends string> = {
  value: T;
  label: string;
};

type AiSelectProps<T extends string> = {
  id?: string;
  value: T;
  options: readonly AiSelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
  ariaLabelledBy?: string;
};

export function AiSelect<T extends string>({
  id,
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  ariaLabelledBy,
}: AiSelectProps<T>) {
  const generatedId = useId().replaceAll(":", "");
  const triggerId = id || `${generatedId}-trigger`;
  const menuId = `${triggerId}-options`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingFocusIndex = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    const focusIndex = pendingFocusIndex.current ?? selectedIndex;
    pendingFocusIndex.current = null;
    requestAnimationFrame(() => optionRefs.current[focusIndex]?.focus());
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open, selectedIndex]);

  function openAt(index: number) {
    pendingFocusIndex.current = index;
    setOpen(true);
  }

  function handleTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openAt(selectedIndex);
    } else if (event.key === "Home") {
      event.preventDefault();
      openAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      openAt(options.length - 1);
    }
  }

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = optionRefs.current.findIndex((option) => option === document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      optionRefs.current[(currentIndex + 1 + options.length) % options.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      optionRefs.current[(currentIndex - 1 + options.length) % options.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      optionRefs.current[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      optionRefs.current[options.length - 1]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className="ai-select" ref={rootRef}>
      <button
        id={triggerId}
        ref={triggerRef}
        type="button"
        className="ai-select-trigger"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy ? `${ariaLabelledBy} ${triggerId}` : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selected?.label ?? ""}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div id={menuId} className="ai-select-menu" role="listbox" onKeyDown={handleMenuKeyDown}>
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => { optionRefs.current[index] = element; }}
              type="button"
              className="ai-select-option"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <Check aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
