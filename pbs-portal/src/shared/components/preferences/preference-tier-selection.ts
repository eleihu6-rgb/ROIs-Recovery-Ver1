type PreferenceTier = {
  active?: boolean;
  key: string;
};

/** Preference dialogs allow an empty selection and make it a required state. */
export const togglePreferenceTier = <TTier extends PreferenceTier>(
  tiers: TTier[],
  tierKey: string,
): TTier[] => tiers.map((tier) => tier.key === tierKey ? { ...tier, active: !tier.active } : tier);
