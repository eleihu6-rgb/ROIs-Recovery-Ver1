import type { PropsWithChildren } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Message } from "@rois/ui";
import { I18nProvider } from "@/shared/i18n";
import { queryClient } from "@/shared/query/query-client";

export const AppProviders = ({ children }: PropsWithChildren) => {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        {children}
        <Message />
      </I18nProvider>
    </QueryClientProvider>
  );
};
