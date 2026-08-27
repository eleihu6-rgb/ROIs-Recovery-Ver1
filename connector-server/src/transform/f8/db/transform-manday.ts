import type { MandayFdRecord, MandayCcAmRecord } from '../../../types/import-jobs.js'

/**
 * Transform raw F8 manday API response rows into typed import records.
 *
 * The F8 API returns daily crew manday data in camelCase JSON. Two separate
 * endpoints are expected:
 *   /crewMandayFd   → flight-deck pilots  (division='P') → MandayFdRecord[]
 *   /crewMandayCcAm → cabin crew (division='C') → MandayCcAmRecord[]
 *
 * Fields not present in the raw payload default to 0 / null so the worker
 * can safely upsert without conditional logic.
 */

function num(v: unknown, def = 0): number {
  const n = Number(v)
  return isNaN(n) ? def : n
}

function numNullable(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function str(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  return String(v).slice(0, 100)
}

function dateStr(v: unknown): string {
  if (!v) return ''
  const s = String(v)
  // Accepts 'YYYY-MM-DD', 'YYYY-MM-DDTHH:mm:ssZ', etc. — extract date part only.
  return s.slice(0, 10)
}

export function transformF8MandayFd(raw: unknown[]): MandayFdRecord[] {
  const records: MandayFdRecord[] = []
  for (const item of raw) {
    const r = item as Record<string, unknown>
    const crewId = String(r['crewId'] ?? '').trim()
    const crewBaseDt = dateStr(r['crewBaseDt'] ?? r['crew_base_dt'])
    if (!crewId || !crewBaseDt) continue

    records.push({
      crewId,
      crewBaseDt,
      ft:                num(r['ft']),
      augumentFt:        num(r['augumentFt'] ?? r['augment_ft']),
      doubleFt:          num(r['doubleFt']   ?? r['double_ft']),
      blh:               num(r['blh']),
      augumentBlh:       num(r['augumentBlh'] ?? r['augment_blh']),
      doubleBlh:         num(r['doubleBlh']   ?? r['double_blh']),
      fdp:               num(r['fdp']),
      dp:                num(r['dp']),
      nightDp:           num(r['nightDp']     ?? r['night_dp']),
      travel:            num(r['travel']),
      credit:            num(r['credit']),
      fatigue:           num(r['fatigue']),
      isLeave:           num(r['isLeave']     ?? r['is_leave']),
      isDayOff:          num(r['isDayOff']    ?? r['is_day_off']),
      standby:           num(r['standby']),
      actTakeOffs:       num(r['actTakeOffs'] ?? r['act_take_offs']),
      actLandings:       num(r['actLandings'] ?? r['act_landings']),
      ground:            num(r['ground']),
      actingRank:        str(r['actingRank']  ?? r['acting_rank']),
      fleet:             str(r['fleet']),
      perDiem:           num(r['perDiem']     ?? r['per_diem']),
      normalWp:          num(r['normalWp']    ?? r['normal_wp']),
      extendWp:          num(r['extendWp']    ?? r['extend_wp']),
      csb:               num(r['csb']),
      hsb:               num(r['hsb']),
      asb:               num(r['asb']),
      isAl:              num(r['isAl']        ?? r['is_al']),
      updowns:           num(r['updowns']),
      cat2Updowns:       num(r['cat2Updowns'] ?? r['cat2_updowns']),
      expBlh:            num(r['expBlh']      ?? r['exp_blh']),
      quarantine:        num(r['quarantine']),
      custData1:         numNullable(r['custData1']  ?? r['cust_data1']),
      custData2:         numNullable(r['custData2']  ?? r['cust_data2']),
      highPlateau:       num(r['highPlateau'] ?? r['high_plateau']),
      operatingFleets:   str(r['operatingFleets']   ?? r['operating_fleets']),
      operatingAirports: str(r['operatingAirports'] ?? r['operating_airports']),
      takeoff:           num(r['takeoff']),
      landing:           num(r['landing']),
      isPosition:        num(r['isPosition']  ?? r['is_position']),
      workingHour:       numNullable(r['workingHour']   ?? r['working_hour']),
      pncCredit:         numNullable(r['pncCredit']     ?? r['pnc_credit']),
      simCredit:         numNullable(r['simCredit']     ?? r['sim_credit']),
      alCredit:          numNullable(r['alCredit']      ?? r['al_credit']),
      olCredit:          numNullable(r['olCredit']      ?? r['ol_credit']),
      freighterCredit:   numNullable(r['freighterCredit']   ?? r['freighter_credit']),
      layoverDay:        numNullable(r['layoverDay']    ?? r['layover_day']),
      lhPerDiem:         numNullable(r['lhPerDiem']     ?? r['lh_per_diem']),
      sbyDp:             num(r['sbyDp']       ?? r['sby_dp']),
      dhdDp:             num(r['dhdDp']       ?? r['dhd_dp']),
      fleetTakeoff:      str(r['fleetTakeoff']    ?? r['fleet_takeoff']),
      fleetLanding:      str(r['fleetLanding']    ?? r['fleet_landing']),
      nightTakeoff:      str(r['nightTakeoff']    ?? r['night_takeoff']),
      nightLanding:      str(r['nightLanding']    ?? r['night_landing']),
      schCredit:         numNullable(r['schCredit']      ?? r['sch_credit']),
      schPerDiem:        numNullable(r['schPerDiem']     ?? r['sch_per_diem']),
      schLhPerDiem:      numNullable(r['schLhPerDiem']   ?? r['sch_lh_per_diem']),
      schPncCredit:      numNullable(r['schPncCredit']   ?? r['sch_pnc_credit']),
      schSimCredit:      numNullable(r['schSimCredit']   ?? r['sch_sim_credit']),
      schAlCredit:       numNullable(r['schAlCredit']    ?? r['sch_al_credit']),
      schOlCredit:       numNullable(r['schOlCredit']    ?? r['sch_ol_credit']),
      schFreighterCredit:numNullable(r['schFreighterCredit'] ?? r['sch_freighter_credit']),
      attributes:        str(r['attributes']),
      intBlh:            numNullable(r['intBlh']         ?? r['int_blh']),
      fltNum:            numNullable(r['fltNum']         ?? r['flt_num']),
      crossTzDutyCount:  numNullable(r['crossTzDutyCount']  ?? r['cross_tz_duty_count']),
      layoverTimes:      numNullable(r['layoverTimes']   ?? r['layover_times']),
      layoverDuration:   numNullable(r['layoverDuration']?? r['layover_duration']),
    })
  }
  return records
}

export function transformF8MandayCcAm(raw: unknown[]): MandayCcAmRecord[] {
  const records: MandayCcAmRecord[] = []
  for (const item of raw) {
    const r = item as Record<string, unknown>
    const crewId = String(r['crewId'] ?? '').trim()
    const crewBaseDt = dateStr(r['crewBaseDt'] ?? r['crew_base_dt'])
    if (!crewId || !crewBaseDt) continue

    records.push({
      crewId,
      crewBaseDt,
      ft:                num(r['ft']),
      blh:               num(r['blh']),
      fdp:               num(r['fdp']),
      dp:                num(r['dp']),
      custDp:            num(r['custDp']     ?? r['cust_dp']),
      nightDp:           num(r['nightDp']    ?? r['night_dp']),
      travel:            num(r['travel']),
      credit:            num(r['credit']),
      fatigue:           num(r['fatigue']),
      isLeave:           num(r['isLeave']    ?? r['is_leave']),
      isDayOff:          num(r['isDayOff']   ?? r['is_day_off']),
      standby:           num(r['standby']),
      ground:            num(r['ground']),
      perDiem:           num(r['perDiem']    ?? r['per_diem']),
      normalWp:          num(r['normalWp']   ?? r['normal_wp']),
      extendWp:          num(r['extendWp']   ?? r['extend_wp']),
      csb:               num(r['csb']),
      hsb:               num(r['hsb']),
      asb:               num(r['asb']),
      isAl:              num(r['isAl']       ?? r['is_al']),
      quarantine:        num(r['quarantine']),
      custData1:         numNullable(r['custData1']  ?? r['cust_data1']),
      custData2:         numNullable(r['custData2']  ?? r['cust_data2']),
      highPlateau:       num(r['highPlateau']?? r['high_plateau']),
      operatingFleets:   str(r['operatingFleets']   ?? r['operating_fleets']),
      operatingAirports: str(r['operatingAirports'] ?? r['operating_airports']),
      workingHour:       num(r['workingHour']?? r['working_hour']),
      pncCredit:         numNullable(r['pncCredit']   ?? r['pnc_credit']),
      simCredit:         numNullable(r['simCredit']   ?? r['sim_credit']),
      alCredit:          numNullable(r['alCredit']    ?? r['al_credit']),
      olCredit:          numNullable(r['olCredit']    ?? r['ol_credit']),
      freighterCredit:   numNullable(r['freighterCredit'] ?? r['freighter_credit']),
      layoverDay:        numNullable(r['layoverDay']  ?? r['layover_day']),
      lhPerDiem:         numNullable(r['lhPerDiem']   ?? r['lh_per_diem']),
      sbyDp:             num(r['sbyDp']      ?? r['sby_dp']),
      dhdDp:             num(r['dhdDp']      ?? r['dhd_dp']),
      attributes:        str(r['attributes']),
      intBlh:            numNullable(r['intBlh']      ?? r['int_blh']),
      fltNum:            numNullable(r['fltNum']      ?? r['flt_num']),
      crossTzDutyCount:  numNullable(r['crossTzDutyCount'] ?? r['cross_tz_duty_count']),
      layoverTimes:      numNullable(r['layoverTimes']?? r['layover_times']),
      layoverDuration:   numNullable(r['layoverDuration'] ?? r['layover_duration']),
    })
  }
  return records
}
