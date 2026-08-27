const RESERVE_TIERS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7"];

type ReserveTierSelectorProps = {
  activeTier: string;
  onChange: (tier: string) => void;
};

export const ReserveTierSelector = ({ activeTier, onChange }: ReserveTierSelectorProps) => (
  <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Reserve tier selector">
    {RESERVE_TIERS.map((tier) => {
      const active = tier === activeTier;

      return (
        <button
          key={tier}
          aria-pressed={active}
          className={`h-[30px] min-w-[46px] rounded-xl border px-3 text-xs font-bold transition ${
            active
              ? "border-[#706cd5] bg-[#706cd5] text-white"
              : "border-[#d8dde6] bg-white text-[#6f7485] hover:bg-[#f5f7ff]"
          }`}
          type="button"
          onClick={() => onChange(tier)}
        >
          {tier}
        </button>
      );
    })}
  </div>
);
