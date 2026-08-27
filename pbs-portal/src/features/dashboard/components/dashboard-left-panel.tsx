import avatarSrc from "@/assets/images/avatar.png";
import { DashboardInfoTable, type DashboardInfoTableCell } from "@/features/dashboard/components/dashboard-info-table";
import type { DashboardUserPanelData } from "@/features/dashboard/types";

type DashboardLeftPanelProps = {
  data: DashboardUserPanelData;
};

export const DashboardLeftPanel = ({ data }: DashboardLeftPanelProps) => {
  const bidInfoRows: DashboardInfoTableCell[][] = data.bidInfoRows.map((row) => [
    { content: row.label, tone: "header" },
    { content: row.value, tone: row.highlight ? "accent" : "value" },
  ]);

  const userInfoRows = data.userInfoGrid.headers.flatMap((headers, rowIndex): DashboardInfoTableCell[][] => [
    headers.map((header) => ({
      content: header,
      tone: "header",
      multiline: header.includes("\n"),
    })),
    data.userInfoGrid.values[rowIndex].map((value) => ({
      content: value,
      tone: "value",
      multiline: value.includes("\n"),
    })),
  ]);

  return (
    <section className="min-h-full rounded-3xl bg-white pb-10 shadow-[10px_20px_60px_rgba(0,0,0,0.05)]">
      <div className="mx-auto mt-16 h-[72px] w-[72px] overflow-hidden rounded-full">
        <img alt="" className="h-full w-full object-cover" src={avatarSrc} />
      </div>

      <div className="mt-3 text-center">
        <h1 className="text-2xl font-medium leading-[29px] text-[#282c3b]">{data.name}</h1>
        <p className="mt-3 text-base leading-[19px] text-[#6f7485]">{data.email}</p>
      </div>

      <div className="mt-8 space-y-6">
        <div>
          <div className="mx-6 flex h-8 items-center rounded-sm bg-[rgba(104,102,204,0.08)]">
            <span className="h-8 w-1 rounded-l-sm bg-[#706cd5]" />
            <span className="ml-3 text-sm font-medium leading-[18px] text-[#4d4f5c]">{data.bidInfoTitle}</span>
          </div>

          <div className="mx-6 mt-4">
            <DashboardInfoTable columnsTemplate="130px minmax(0, 1fr)" compact rows={bidInfoRows} />
          </div>
        </div>

        <div>
          <div className="mx-6 flex h-8 items-center rounded-sm bg-[rgba(104,102,204,0.08)]">
            <span className="h-8 w-1 rounded-l-sm bg-[#706cd5]" />
            <span className="ml-3 text-sm font-medium leading-[18px] text-[#4d4f5c]">{data.userInfoTitle}</span>
          </div>

          <div className="mx-6 mt-4">
            <DashboardInfoTable columnsTemplate="repeat(3, minmax(0, 1fr))" rows={userInfoRows} />
          </div>
        </div>
      </div>
    </section>
  );
};
