export const pbsTierPolicy = Object.freeze({
  version: "solver-preference-v1",
  weights: Object.freeze({
    T1: 7,
    T2: 6,
    T3: 5,
    T4: 4,
    T5: 3,
    T6: 2,
    T7: 1,
  }),
});

export const getPbsTierWeight = (tier) => pbsTierPolicy.weights[tier] ?? null;
