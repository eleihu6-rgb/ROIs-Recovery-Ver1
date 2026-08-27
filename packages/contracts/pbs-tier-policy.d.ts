export type PbsTier = "T1" | "T2" | "T3" | "T4" | "T5" | "T6" | "T7";

export declare const pbsTierPolicy: {
  readonly version: "solver-preference-v1";
  readonly weights: Readonly<Record<PbsTier, number>>;
};

export declare const getPbsTierWeight: (tier: string) => number | null;
