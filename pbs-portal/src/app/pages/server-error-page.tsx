import { Link } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";

export const ServerErrorPage = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#edf4fa] px-6 py-12">
      <div className="w-full max-w-[520px] rounded-xl bg-white p-10 text-center shadow-[10px_20px_60px_rgba(0,0,0,0.05)]">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#706cd5]">500</p>
        <h1 className="mt-4 text-3xl font-semibold text-[#282c3b]">Something went wrong</h1>
        <p className="mt-3 text-sm leading-6 text-[#6f7485]">
          We could not load this view right now. Please return to the dashboard and try again.
        </p>
        <Button asChild className="mt-8 h-11 rounded-3xl bg-[#706cd5] px-6 text-white">
          <Link to="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
};
