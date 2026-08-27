import { PanelMessageState } from "@/shared/components/panel";
import { PairingRightPanelLoading } from "@/features/pairing/components/pairing-right-panel-loading";
import { usePairingPageData } from "@/features/pairing/hooks/use-pairing-page-data";
import { PairingRightPanel } from "@/features/pairing/components/pairing-right-panel";
import type { PairingRightPanelPresentation } from "@/features/pairing/components/pairing-right-panel";

type PairingPageProps = {
  presentation?: PairingRightPanelPresentation;
};

export const PairingPage = ({ presentation }: PairingPageProps = {}) => {
  const { data, isLoading } = usePairingPageData();

  if (isLoading) {
    return (
      <PairingRightPanelLoading
        statusLabel="Loading current pairing draft..."
        testId="pairing-page-loading"
      />
    );
  }

  if (!data) {
    return (
      <PanelMessageState
        message="Unable to load the current pairing draft."
        testId="pairing-page-error"
        title="EXISTING PAIRING PROPERTIES"
      />
    );
  }

  return <PairingRightPanel data={data.rightPanel} presentation={presentation} />;
};
