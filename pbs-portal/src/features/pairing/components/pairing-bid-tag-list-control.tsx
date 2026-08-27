import { XMarkIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/shared/components/ui/input";
import { BidDateInput } from "@/features/pairing/components/pairing-bid-control-inputs";
import {
  normalizePairingBidTag,
  parsePairingBidTagInput,
  type PairingIdListBid,
  type TagListBid,
} from "@/features/pairing/pairing-bid-control-logic";
import type {
  PairingBidAutocompleteConfig,
  PairingBidAutocompleteOption,
} from "@/features/pairing/types";

type SelectableTagBid = TagListBid | PairingIdListBid;

type MenuPosition = {
  left: number;
  maxHeight: number;
  top: number;
  width: number;
};

type TagListControlProps = {
  autocomplete?: PairingBidAutocompleteConfig;
  bid: SelectableTagBid;
  ariaLabel: string;
  disabled?: boolean;
  fieldClassName?: string;
  inputClassName?: string;
  placeholder: string;
  tokenClassName?: string;
  onChange: (value: SelectableTagBid) => void;
};

const useDebouncedValue = (value: string, delayMs: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [delayMs, value]);

  return debouncedValue;
};

const AUTOCOMPLETE_GAP = 6;
const AUTOCOMPLETE_MAX_HEIGHT = 220;
const AUTOCOMPLETE_MIN_HEIGHT = 120;
const VIEWPORT_MARGIN = 12;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

const getSelectableTagIds = (bid: SelectableTagBid) =>
  bid.type === "pairing-id-list" ? bid.pairingIds : bid.values;

const getSelectableTagLabels = (bid: SelectableTagBid) =>
  bid.type === "pairing-id-list" ? bid.pairingLabels : bid.suggestions;

const updateSelectableTagBid = (
  bid: SelectableTagBid,
  ids: string[],
  labels?: string[],
): SelectableTagBid => {
  if (bid.type === "pairing-id-list") {
    return {
      ...bid,
      pairingIds: ids,
      pairingLabels: labels && labels.length > 0 ? labels : undefined,
    };
  }

  return {
    ...bid,
    values: ids,
    suggestions: labels && labels.length > 0 ? labels : undefined,
  };
};

const TagListAutocompleteMenu = ({
  anchorRef,
  autocomplete,
  isDebouncing,
  query,
  onSelect,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  autocomplete: PairingBidAutocompleteConfig;
  isDebouncing: boolean;
  query: string;
  onSelect: (option: PairingBidAutocompleteOption) => void;
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<MenuPosition>({
    left: 0,
    maxHeight: AUTOCOMPLETE_MAX_HEIGHT,
    top: 0,
    width: 0,
  });
  const normalizedQuery = query.trim();
  const optionsQuery = useQuery({
    queryKey: [...autocomplete.queryKey, normalizedQuery],
    queryFn: () => autocomplete.search(normalizedQuery),
    enabled: normalizedQuery.length >= autocomplete.minQueryLength,
    staleTime: 60_000,
  });
  const options = optionsQuery.data ?? [];

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;

    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const width = Math.min(rect.width, window.innerWidth - VIEWPORT_MARGIN * 2);
    const left = clamp(rect.left, VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN);
    const spaceBelow = window.innerHeight - rect.bottom - AUTOCOMPLETE_GAP - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - AUTOCOMPLETE_GAP - VIEWPORT_MARGIN;
    const openAbove = spaceBelow < AUTOCOMPLETE_MIN_HEIGHT && spaceAbove > spaceBelow;
    const availableHeight = Math.max(openAbove ? spaceAbove : spaceBelow, AUTOCOMPLETE_MIN_HEIGHT);
    const maxHeight = clamp(availableHeight, AUTOCOMPLETE_MIN_HEIGHT, AUTOCOMPLETE_MAX_HEIGHT);
    const top = openAbove
      ? clamp(rect.top - AUTOCOMPLETE_GAP - maxHeight, VIEWPORT_MARGIN, window.innerHeight - maxHeight - VIEWPORT_MARGIN)
      : clamp(rect.bottom + AUTOCOMPLETE_GAP, VIEWPORT_MARGIN, window.innerHeight - maxHeight - VIEWPORT_MARGIN);

    setPosition({ left, maxHeight, top, width });
  }, [anchorRef]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  useEffect(() => {
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition]);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[90] overflow-hidden rounded-2xl border border-[#d8dde6] bg-white shadow-[0_12px_30px_rgba(68,76,96,0.14)]"
      data-testid="pairing-tag-list-autocomplete"
      role="listbox"
      style={{
        left: position.left,
        top: position.top,
        width: position.width,
      }}
    >
      {isDebouncing || optionsQuery.isLoading || optionsQuery.isFetching ? (
        <div className="px-3 py-2 text-xs font-medium text-[#8d93a5]" role="status">
          {autocomplete.loadingLabel}
        </div>
      ) : null}

      {!isDebouncing && optionsQuery.isError ? (
        <div className="px-3 py-2 text-xs font-medium text-[#d05b5b]" role="alert">
          {autocomplete.errorLabel}
        </div>
      ) : null}

      {!isDebouncing && !optionsQuery.isLoading && !optionsQuery.isError && options.length === 0 ? (
        <div className="px-3 py-2 text-xs font-medium text-[#8d93a5]">
          {autocomplete.emptyLabel}
        </div>
      ) : null}

      {!isDebouncing && !optionsQuery.isError && options.length > 0 ? (
        <div className="overflow-y-auto py-1" style={{ maxHeight: position.maxHeight }}>
          {options.map((option) => (
            <button
              key={`${option.value}-${option.pairingId ?? option.label}`}
              className="flex w-full cursor-pointer flex-col items-start gap-0.5 px-3 py-2 text-left text-xs text-[#6f7485] hover:bg-[#f5f7ff] focus-visible:bg-[#f5f7ff] focus-visible:outline-none"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(option)}
            >
              <span className="font-semibold text-[#40424f]">{option.pairingLabel ?? option.value}</span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>,
    document.body,
  );
};

export const TagListControl = ({
  autocomplete,
  bid,
  ariaLabel,
  disabled = false,
  fieldClassName = "",
  inputClassName = "",
  placeholder,
  tokenClassName = "",
  onChange,
}: TagListControlProps) => {
  const [draftToken, setDraftToken] = useState("");
  const fieldRef = useRef<HTMLDivElement>(null);
  const bidDate = bid.type === "tag-list-date" ? bid.date : "";
  const selectedIds = getSelectableTagIds(bid);
  const selectedLabels = getSelectableTagLabels(bid);
  const autocompleteDebounceMs = autocomplete?.debounceMs ?? 300;
  const debouncedDraftToken = useDebouncedValue(draftToken, autocompleteDebounceMs);
  const isAutocompleteDebouncing = draftToken.trim() !== debouncedDraftToken.trim();
  const shouldShowAutocomplete = Boolean(
    autocomplete && draftToken.trim().length >= autocomplete.minQueryLength,
  );
  const getTokenDisplayLabel = (token: string, index: number) => {
    const suggestion = selectedLabels?.length === selectedIds.length
      ? selectedLabels[index]?.trim()
      : "";

    return suggestion || token;
  };

  useEffect(() => {
    setDraftToken("");
  }, [bid.type, selectedIds, bidDate]);

  const addTokens = (nextTokens: string[], displayLabels: string[] = []) => {
    if (nextTokens.length === 0) {
      return;
    }

    const existingTokens = new Set(selectedIds.map((value) => normalizePairingBidTag(value)));
    const merged = [...selectedIds];
    let mergedLabels = selectedLabels ? [...selectedLabels] : undefined;

    nextTokens.forEach((token, index) => {
      if (existingTokens.has(token)) {
        return;
      }

      existingTokens.add(token);
      merged.push(token);
      const displayLabel = displayLabels[index]?.trim();

      if (displayLabel) {
        mergedLabels ??= Array.from(
          { length: merged.length - 1 },
          (_, valueIndex) => selectedLabels?.[valueIndex] ?? "",
        );
        mergedLabels.push(displayLabel);
      }
    });

    if (merged.length === selectedIds.length) {
      return;
    }

    onChange(updateSelectableTagBid(bid, merged, mergedLabels));
  };

  const commitTokens = () => {
    if (disabled) {
      return;
    }

    if (autocomplete && autocomplete.allowCustomTokens === false) {
      setDraftToken("");
      return;
    }

    addTokens(parsePairingBidTagInput(draftToken));
    setDraftToken("");
  };

  const removeToken = (tokenToRemove: string) => {
    if (disabled) {
      return;
    }

    const tokenIndex = selectedIds.findIndex((token) => token === tokenToRemove);
    const nextLabels = selectedLabels
      ? selectedLabels.filter((_, index) => index !== tokenIndex)
      : undefined;

    onChange(updateSelectableTagBid(
      bid,
      selectedIds.filter((token) => token !== tokenToRemove),
      nextLabels && nextLabels.length > 0 ? nextLabels : undefined,
    ));
  };

  const selectAutocompleteOption = (option: PairingBidAutocompleteOption) => {
    if (disabled) {
      return;
    }

    const tokenValue = option.pairingId ?? option.value;
    const displayLabel = option.pairingLabel?.trim();

    addTokens([tokenValue], displayLabel ? [displayLabel] : []);
    setDraftToken("");
  };

  return (
    <div className="space-y-3">
      <div
        ref={fieldRef}
        className={[
          "relative rounded-3xl border border-[#cfd6e4] bg-white px-3 py-3",
          disabled ? "bg-[#f5f7fa]" : "",
          fieldClassName,
        ].join(" ")}
      >
        <div className="flex min-h-[28px] flex-wrap gap-2">
          {selectedIds.map((token, index) => (
            <span
              key={`${ariaLabel}-${token}`}
              className={[
                "inline-flex items-center gap-1 rounded-full bg-[#eef2ff] px-[10px] py-[4px] text-xs font-semibold text-[#6467d1]",
                tokenClassName,
              ].join(" ")}
            >
              {getTokenDisplayLabel(token, index)}
              <button
                aria-label={`Remove ${getTokenDisplayLabel(token, index)} from ${ariaLabel}`}
                className="inline-flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-[#6467d1] transition hover:bg-[#dfe5ff] focus-visible:outline-none"
                disabled={disabled}
                type="button"
                onClick={() => removeToken(token)}
              >
                <XMarkIcon className="h-3.5 w-3.5 stroke-[2]" />
              </button>
            </span>
          ))}

          <Input
            aria-label={ariaLabel}
            className={[
              "h-7 min-w-[140px] flex-1 border-0 bg-transparent px-0 text-sm font-medium text-[#6f7485] shadow-none placeholder:text-[#a0a7b5] focus-visible:ring-0",
              inputClassName,
            ].join(" ")}
            disabled={disabled}
            placeholder={autocomplete?.placeholder ?? placeholder}
            type="text"
            value={draftToken}
            onBlur={commitTokens}
            onChange={(event) => setDraftToken(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.key === "Process") {
                return;
              }

              if (event.key !== "Enter" && event.key !== ",") {
                return;
              }

              event.preventDefault();
              commitTokens();
            }}
          />
        </div>

        {autocomplete && shouldShowAutocomplete && !disabled ? (
          <TagListAutocompleteMenu
            anchorRef={fieldRef}
            autocomplete={autocomplete}
            isDebouncing={isAutocompleteDebouncing}
            query={debouncedDraftToken}
            onSelect={selectAutocompleteOption}
          />
        ) : null}
      </div>

      {bid.type === "tag-list-date" ? (
        <BidDateInput
          ariaLabel={`${ariaLabel} date`}
          value={bid.date}
          onValueChange={(date) =>
            onChange({
              ...bid,
              date,
              suggestions: bid.suggestions ? [...bid.suggestions] : undefined,
            })
          }
        />
      ) : null}
    </div>
  );
};
