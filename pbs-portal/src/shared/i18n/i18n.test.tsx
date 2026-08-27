import { render, screen } from "@testing-library/react";
import { I18nProvider } from "@/shared/i18n/provider";
import { useI18n } from "@/shared/i18n/use-i18n";

const Probe = () => {
  const { t } = useI18n();
  return (
    <>
      <span>{t("nav.home")}</span>
      <span>{t("unknown.key")}</span>
      <span>{t("ruleBid.favorite.removeAction", { propertyName: "Prefer Off" })}</span>
    </>
  );
};

describe("I18nProvider", () => {
  it("returns English copy for known keys and the raw key for missing copy", () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("unknown.key")).toBeInTheDocument();
    expect(screen.getByText("Remove favorite Prefer Off")).toBeInTheDocument();
  });
});
