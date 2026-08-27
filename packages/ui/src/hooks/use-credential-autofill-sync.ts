import {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
} from "react";

interface CredentialAutofillSyncField {
  name: string;
  value: string;
  onValueChange: (value: string) => void;
}

interface UseCredentialAutofillSyncOptions {
  fields: readonly CredentialAutofillSyncField[];
  formRef: RefObject<HTMLFormElement | null>;
}

export const useCredentialAutofillSync = ({
  fields,
  formRef,
}: UseCredentialAutofillSyncOptions): void => {
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;

  const syncDomValues = useCallback(() => {
    const form = formRef.current;
    if (!form) {
      return;
    }

    for (const field of fieldsRef.current) {
      const input = form.elements.namedItem(field.name);
      if (input instanceof HTMLInputElement && input.value !== field.value) {
        field.onValueChange(input.value);
      }
    }
  }, [formRef]);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(syncDomValues);
    const syncTimer = window.setInterval(syncDomValues, 250);
    const handlePageShow = () => syncDomValues();

    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearInterval(syncTimer);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [syncDomValues]);
};

export type { CredentialAutofillSyncField, UseCredentialAutofillSyncOptions };
