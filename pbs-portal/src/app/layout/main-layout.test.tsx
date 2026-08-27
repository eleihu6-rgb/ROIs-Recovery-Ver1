import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MainLayout } from "@/app/layout/main-layout";
import { useAuthSessionStore } from "@/features/auth/store/use-auth-session-store";

const setViewportWidth = (width: number) => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
    writable: true,
  });
};

describe("MainLayout", () => {
  beforeEach(() => {
    setViewportWidth(1440);
    useAuthSessionStore.setState({
      status: "authenticated",
      user: { id: "u-1", name: "Emma Crew", employeeNo: "F8001" },
      authMode: "password",
    });
  });

  afterEach(() => {
    setViewportWidth(1024);
  });

  it("keeps main padding-top aligned to the scaled header height", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/dashboard" element={<div>Body</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("main-layout-content")).toHaveStyle({ paddingTop: "76px" });
  });
});
