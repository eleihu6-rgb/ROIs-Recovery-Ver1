export const buildPairingCreditMinutesExpression = (
  schema: string,
  pairingAlias: string,
) => `coalesce((
  select sum(coalesce(duty_credit.duty_act_credited_minutes, 0))
  from (
    select distinct on (credit_segment.duty_seq)
      credit_segment.duty_seq,
      credit_segment.duty_act_credited_minutes
    from ${schema}.pairing_segment credit_segment
    where credit_segment.pairing_id = ${pairingAlias}.id
      and credit_segment.is_deleted = 0
    order by credit_segment.duty_seq asc, credit_segment.seg_seq asc
  ) duty_credit
), 0)`;
