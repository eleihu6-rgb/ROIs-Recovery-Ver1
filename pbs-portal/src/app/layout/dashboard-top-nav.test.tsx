import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DashboardTopNav } from "@/app/layout/dashboard-top-nav";
import { isUiInspectorAvailable } from "@/shared/config/dev-tools";
import { TOP_NAV_ITEMS } from "@/shared/constants/top-nav-items";
import { useAuthSessionStore } from "@/features/auth/store/use-auth-session-store";

vi.mock("@/shared/config/dev-tools", () => ({
  isUiInspectorAvailable: vi.fn(() => true),
}));

const mockedIsUiInspectorAvailable = vi.mocked(isUiInspectorAvailable);

const setViewportWidth = (width: number) => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
    writable: true,
  });
};

describe("DashboardTopNav", () => {
  beforeEach(() => {
    setViewportWidth(1920);
    mockedIsUiInspectorAvailable.mockReturnValue(true);
    useAuthSessionStore.setState({
      status: "authenticated",
      user: { id: "u-1", name: "Emma Crew", employeeNo: "F8001" },
      authMode: "password",
    });
  });

  afterEach(() => {
    setViewportWidth(1024);
  });

  it("renders the reference nav items and keeps only the active route highlighted", () => {
    render(
      <MemoryRouter initialEntries={["/bid"]}>
        <DashboardTopNav displayName="Emma" items={TOP_NAV_ITEMS} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bid" }).querySelector("span")).toHaveClass("text-white");
    expect(screen.queryByRole("link", { name: "Days Off" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Pairing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Line" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Reserve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tier" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Award" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Standing Bid" }).querySelector("span")).toHaveClass("text-[#BBBBBB]");
    expect(screen.getByRole("link", { name: "Help" }).querySelector("span")).toHaveClass("text-[#BBBBBB]");
  });

  it("treats the real `/bid` route as the active top-nav item", () => {
    render(
      <MemoryRouter initialEntries={["/bid"]}>
        <DashboardTopNav displayName="Emma" items={TOP_NAV_ITEMS} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Bid" }).querySelector("span")).toHaveClass("text-white");
    expect(screen.queryByRole("link", { name: "Tier" })).not.toBeInTheDocument();
  });

  it("keeps `/bid/pairing/search` under the active Bid top-nav item", () => {
    render(
      <MemoryRouter initialEntries={["/bid/pairing/search"]}>
        <DashboardTopNav displayName="Emma" items={TOP_NAV_ITEMS} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Bid" }).querySelector("span")).toHaveClass("text-white");
    expect(screen.queryByRole("link", { name: "Tier" })).not.toBeInTheDocument();
  });

  it("treats the real `/help` route as the active top-nav item", () => {
    render(
      <MemoryRouter initialEntries={["/help"]}>
        <DashboardTopNav displayName="Emma" items={TOP_NAV_ITEMS} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Help" }).querySelector("span")).toHaveClass("text-white");
    expect(screen.getByRole("link", { name: "Standing Bid" }).querySelector("span")).toHaveClass("text-[#BBBBBB]");
  });

  it("scales the header height proportionally from the 1920px baseline", () => {
    setViewportWidth(1440);

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <DashboardTopNav displayName="Emma" items={TOP_NAV_ITEMS} />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("dashboard-top-nav")).toHaveStyle({ height: "60px" });
    expect(screen.getByTestId("dashboard-top-nav-canvas")).toHaveStyle({
      transform: "scale(0.75)",
    });
  });

  it("moves trailing items into an overflow trigger when the available width shrinks", () => {
    setViewportWidth(640);

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <DashboardTopNav displayName="Emma" items={TOP_NAV_ITEMS} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bid" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Help" })).not.toBeInTheDocument();

    const trigger = screen.getByTestId("dashboard-top-nav-overflow-trigger");
    expect(trigger).toHaveClass("cursor-pointer");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);

    const menu = screen.getByTestId("dashboard-top-nav-overflow-menu");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(menu).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-top-nav-canvas")).not.toContainElement(menu);
    expect(screen.getByRole("menuitem", { name: "Help" })).toBeInTheDocument();
  });

  it("shows the UI Inspector toggle in development mode", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <DashboardTopNav displayName="Emma" items={TOP_NAV_ITEMS} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Toggle UI Inspector" })).toBeInTheDocument();
  });

  it("does not expose inactive notification or settings actions", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <DashboardTopNav displayName="Emma" items={TOP_NAV_ITEMS} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("hides the UI Inspector toggle outside development mode", () => {
    mockedIsUiInspectorAvailable.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <DashboardTopNav displayName="Emma" items={TOP_NAV_ITEMS} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("button", { name: "Toggle UI Inspector" })).not.toBeInTheDocument();
  });
});
