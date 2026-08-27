import { useNavigate } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { useAuthSessionStore } from "@/features/auth/store/use-auth-session-store";

export const NotFoundPage = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAuthSessionStore((state) => state.status === "authenticated");

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate(isAuthenticated ? "/dashboard" : "/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#edf4fa] px-6 py-12">
      <div className="w-full max-w-[520px] rounded-xl bg-white p-10 text-center shadow-[10px_20px_60px_rgba(0,0,0,0.05)]">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#706cd5]">404</p>
        <h1 className="mt-4 text-3xl font-semibold text-[#282c3b]">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-[#6f7485]">
          This part of ROIS Crew has not been built yet, or the link is no longer available.
        </p>
        <div className="mt-8 flex justify-center">
          <Button
            className="h-11 rounded-3xl bg-[#706cd5] px-6 text-white"
            type="button"
            onClick={handleBack}
          >
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
};
