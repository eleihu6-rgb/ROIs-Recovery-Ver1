import { withBullmqPrefix } from '../utils/redis-key-prefix.js'
import { Worker } from 'bullmq'
import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { env } from '../config/index.js'
import { attachBullmqErrorLogger, getBullmqRedisConnection } from '../utils/bullmq-redis.js'
import type { MandayImportJob, MandayFdRecord, MandayCcAmRecord } from '../types/import-jobs.js'
import {
  partitionManday,
  type RpRange,
  MANDAY_FD_NUMERIC_FIELDS,
  MANDAY_CC_AM_NUMERIC_FIELDS,
} from '../services/manday/manday-partition.js'
import { refreshMandayAfterImport } from './manday-refresh-after-import.js'

type Db = NodePgDatabase<Record<string, unknown>>

// ---------------------------------------------------------------------------
// FD upserts
// ---------------------------------------------------------------------------

async function upsertFdDaily(db: Db, rows: ReturnType<typeof partitionManday>['daily']): Promise<number> {
  if (rows.length === 0) return 0
  for (const r of rows) {
    await db.execute(sql`
      INSERT INTO crew_manday_fd_daily (
        crew_id, crew_base_dt,
        ft, augument_ft, double_ft, blh, augument_blh, double_blh,
        fdp, dp, night_dp, travel, credit, fatigue,
        is_leave, is_day_off, standby, act_take_offs, act_landings, ground,
        acting_rank, fleet, per_diem, normal_wp, extend_wp,
        csb, hsb, asb, is_al, updowns, cat2_updowns, exp_blh, quarantine,
        cust_data1, cust_data2, high_plateau, operating_fleets, operating_airports,
        takeoff, landing, is_position, working_hour,
        pnc_credit, sim_credit, al_credit, ol_credit, freighter_credit,
        layover_day, lh_per_diem, sby_dp, dhd_dp,
        fleet_takeoff, fleet_landing, night_takeoff, night_landing,
        sch_credit, sch_per_diem, sch_lh_per_diem,
        sch_pnc_credit, sch_sim_credit, sch_al_credit, sch_ol_credit, sch_freighter_credit,
        attributes, int_blh, flt_num, cross_tz_duty_count, layover_times, layover_duration,
        updated_by, updated_at
      ) VALUES (
        ${r['crewId']}, ${r['crewBaseDt']},
        ${r['ft'] ?? 0}, ${r['augumentFt'] ?? 0}, ${r['doubleFt'] ?? 0},
        ${r['blh'] ?? 0}, ${r['augumentBlh'] ?? 0}, ${r['doubleBlh'] ?? 0},
        ${r['fdp'] ?? 0}, ${r['dp'] ?? 0}, ${r['nightDp'] ?? 0},
        ${r['travel'] ?? 0}, ${r['credit'] ?? 0}, ${r['fatigue'] ?? 0},
        ${r['isLeave'] ?? 0}, ${r['isDayOff'] ?? 0}, ${r['standby'] ?? 0},
        ${r['actTakeOffs'] ?? 0}, ${r['actLandings'] ?? 0}, ${r['ground'] ?? 0},
        ${r['actingRank'] ?? null}, ${r['fleet'] ?? null},
        ${r['perDiem'] ?? 0}, ${r['normalWp'] ?? 0}, ${r['extendWp'] ?? 0},
        ${r['csb'] ?? 0}, ${r['hsb'] ?? 0}, ${r['asb'] ?? 0}, ${r['isAl'] ?? 0},
        ${r['updowns'] ?? 0}, ${r['cat2Updowns'] ?? 0}, ${r['expBlh'] ?? 0}, ${r['quarantine'] ?? 0},
        ${r['custData1'] ?? null}, ${r['custData2'] ?? null},
        ${r['highPlateau'] ?? 0}, ${r['operatingFleets'] ?? null}, ${r['operatingAirports'] ?? null},
        ${r['takeoff'] ?? 0}, ${r['landing'] ?? 0}, ${r['isPosition'] ?? 0}, ${r['workingHour'] ?? null},
        ${r['pncCredit'] ?? null}, ${r['simCredit'] ?? null}, ${r['alCredit'] ?? null},
        ${r['olCredit'] ?? null}, ${r['freighterCredit'] ?? null},
        ${r['layoverDay'] ?? null}, ${r['lhPerDiem'] ?? null},
        ${r['sbyDp'] ?? 0}, ${r['dhdDp'] ?? 0},
        ${r['fleetTakeoff'] ?? null}, ${r['fleetLanding'] ?? null},
        ${r['nightTakeoff'] ?? null}, ${r['nightLanding'] ?? null},
        ${r['schCredit'] ?? null}, ${r['schPerDiem'] ?? null}, ${r['schLhPerDiem'] ?? null},
        ${r['schPncCredit'] ?? null}, ${r['schSimCredit'] ?? null},
        ${r['schAlCredit'] ?? null}, ${r['schOlCredit'] ?? null}, ${r['schFreighterCredit'] ?? null},
        ${r['attributes'] ?? null}, ${r['intBlh'] ?? null}, ${r['fltNum'] ?? null},
        ${r['crossTzDutyCount'] ?? null}, ${r['layoverTimes'] ?? null}, ${r['layoverDuration'] ?? null},
        'F8_IMPORT', now()
      )
      ON CONFLICT (crew_id, crew_base_dt) DO UPDATE SET
        ft = EXCLUDED.ft, augument_ft = EXCLUDED.augument_ft, double_ft = EXCLUDED.double_ft,
        blh = EXCLUDED.blh, augument_blh = EXCLUDED.augument_blh, double_blh = EXCLUDED.double_blh,
        fdp = EXCLUDED.fdp, dp = EXCLUDED.dp, night_dp = EXCLUDED.night_dp,
        travel = EXCLUDED.travel, credit = EXCLUDED.credit, fatigue = EXCLUDED.fatigue,
        is_leave = EXCLUDED.is_leave, is_day_off = EXCLUDED.is_day_off, standby = EXCLUDED.standby,
        act_take_offs = EXCLUDED.act_take_offs, act_landings = EXCLUDED.act_landings,
        ground = EXCLUDED.ground, acting_rank = EXCLUDED.acting_rank, fleet = EXCLUDED.fleet,
        per_diem = EXCLUDED.per_diem, normal_wp = EXCLUDED.normal_wp, extend_wp = EXCLUDED.extend_wp,
        csb = EXCLUDED.csb, hsb = EXCLUDED.hsb, asb = EXCLUDED.asb, is_al = EXCLUDED.is_al,
        updowns = EXCLUDED.updowns, cat2_updowns = EXCLUDED.cat2_updowns, exp_blh = EXCLUDED.exp_blh,
        quarantine = EXCLUDED.quarantine, cust_data1 = EXCLUDED.cust_data1, cust_data2 = EXCLUDED.cust_data2,
        high_plateau = EXCLUDED.high_plateau,
        operating_fleets = EXCLUDED.operating_fleets, operating_airports = EXCLUDED.operating_airports,
        takeoff = EXCLUDED.takeoff, landing = EXCLUDED.landing, is_position = EXCLUDED.is_position,
        working_hour = EXCLUDED.working_hour,
        pnc_credit = EXCLUDED.pnc_credit, sim_credit = EXCLUDED.sim_credit,
        al_credit = EXCLUDED.al_credit, ol_credit = EXCLUDED.ol_credit,
        freighter_credit = EXCLUDED.freighter_credit, layover_day = EXCLUDED.layover_day,
        lh_per_diem = EXCLUDED.lh_per_diem, sby_dp = EXCLUDED.sby_dp, dhd_dp = EXCLUDED.dhd_dp,
        fleet_takeoff = EXCLUDED.fleet_takeoff, fleet_landing = EXCLUDED.fleet_landing,
        night_takeoff = EXCLUDED.night_takeoff, night_landing = EXCLUDED.night_landing,
        sch_credit = EXCLUDED.sch_credit, sch_per_diem = EXCLUDED.sch_per_diem,
        sch_lh_per_diem = EXCLUDED.sch_lh_per_diem, sch_pnc_credit = EXCLUDED.sch_pnc_credit,
        sch_sim_credit = EXCLUDED.sch_sim_credit, sch_al_credit = EXCLUDED.sch_al_credit,
        sch_ol_credit = EXCLUDED.sch_ol_credit, sch_freighter_credit = EXCLUDED.sch_freighter_credit,
        attributes = EXCLUDED.attributes, int_blh = EXCLUDED.int_blh, flt_num = EXCLUDED.flt_num,
        cross_tz_duty_count = EXCLUDED.cross_tz_duty_count,
        layover_times = EXCLUDED.layover_times, layover_duration = EXCLUDED.layover_duration,
        updated_by = 'F8_IMPORT', updated_at = now()
    `)
  }
  return rows.length
}

async function upsertFdMonthly(db: Db, rows: ReturnType<typeof partitionManday>['monthly']): Promise<number> {
  if (rows.length === 0) return 0
  for (const r of rows) {
    await db.execute(sql`
      INSERT INTO crew_manday_fd_period (
        crew_id, roster_period, rp_start, rp_end,
        ft, augument_ft, double_ft, blh, augument_blh, double_blh,
        fdp, dp, night_dp, travel, credit, fatigue,
        is_leave, is_day_off, standby, act_take_offs, act_landings, ground,
        per_diem, normal_wp, extend_wp, csb, hsb, asb, is_al,
        updowns, cat2_updowns, exp_blh, quarantine,
        high_plateau, takeoff, landing, working_hour,
        pnc_credit, sim_credit, al_credit, ol_credit, freighter_credit,
        layover_day, lh_per_diem, sby_dp, dhd_dp,
        sch_credit, int_blh, flt_num, cross_tz_duty_count, layover_times, layover_duration,
        archived_from_daily, updated_by, updated_at
      ) VALUES (
        ${r['crewId']}, ${r['rosterPeriod']}, ${r['rpStart']}, ${r['rpEnd']},
        ${r['ft'] ?? 0}, ${r['augumentFt'] ?? 0}, ${r['doubleFt'] ?? 0},
        ${r['blh'] ?? 0}, ${r['augumentBlh'] ?? 0}, ${r['doubleBlh'] ?? 0},
        ${r['fdp'] ?? 0}, ${r['dp'] ?? 0}, ${r['nightDp'] ?? 0},
        ${r['travel'] ?? 0}, ${r['credit'] ?? 0}, ${r['fatigue'] ?? 0},
        ${r['isLeave'] ?? 0}, ${r['isDayOff'] ?? 0}, ${r['standby'] ?? 0},
        ${r['actTakeOffs'] ?? 0}, ${r['actLandings'] ?? 0}, ${r['ground'] ?? 0},
        ${r['perDiem'] ?? 0}, ${r['normalWp'] ?? 0}, ${r['extendWp'] ?? 0},
        ${r['csb'] ?? 0}, ${r['hsb'] ?? 0}, ${r['asb'] ?? 0}, ${r['isAl'] ?? 0},
        ${r['updowns'] ?? 0}, ${r['cat2Updowns'] ?? 0}, ${r['expBlh'] ?? 0}, ${r['quarantine'] ?? 0},
        ${r['highPlateau'] ?? 0}, ${r['takeoff'] ?? 0}, ${r['landing'] ?? 0},
        ${r['workingHour'] ?? null},
        ${r['pncCredit'] ?? null}, ${r['simCredit'] ?? null}, ${r['alCredit'] ?? null},
        ${r['olCredit'] ?? null}, ${r['freighterCredit'] ?? null},
        ${r['layoverDay'] ?? null}, ${r['lhPerDiem'] ?? null},
        ${r['sbyDp'] ?? 0}, ${r['dhdDp'] ?? 0},
        ${r['schCredit'] ?? null},
        ${r['intBlh'] ?? null}, ${r['fltNum'] ?? null},
        ${r['crossTzDutyCount'] ?? null}, ${r['layoverTimes'] ?? null}, ${r['layoverDuration'] ?? null},
        false, 'F8_IMPORT', now()
      )
      ON CONFLICT (crew_id, roster_period) DO UPDATE SET
        ft = EXCLUDED.ft, augument_ft = EXCLUDED.augument_ft, double_ft = EXCLUDED.double_ft,
        blh = EXCLUDED.blh, augument_blh = EXCLUDED.augument_blh, double_blh = EXCLUDED.double_blh,
        fdp = EXCLUDED.fdp, dp = EXCLUDED.dp, night_dp = EXCLUDED.night_dp,
        travel = EXCLUDED.travel, credit = EXCLUDED.credit, fatigue = EXCLUDED.fatigue,
        is_leave = EXCLUDED.is_leave, is_day_off = EXCLUDED.is_day_off, standby = EXCLUDED.standby,
        act_take_offs = EXCLUDED.act_take_offs, act_landings = EXCLUDED.act_landings,
        ground = EXCLUDED.ground, per_diem = EXCLUDED.per_diem,
        normal_wp = EXCLUDED.normal_wp, extend_wp = EXCLUDED.extend_wp,
        csb = EXCLUDED.csb, hsb = EXCLUDED.hsb, asb = EXCLUDED.asb, is_al = EXCLUDED.is_al,
        updowns = EXCLUDED.updowns, cat2_updowns = EXCLUDED.cat2_updowns, exp_blh = EXCLUDED.exp_blh,
        quarantine = EXCLUDED.quarantine, high_plateau = EXCLUDED.high_plateau,
        takeoff = EXCLUDED.takeoff, landing = EXCLUDED.landing, working_hour = EXCLUDED.working_hour,
        pnc_credit = EXCLUDED.pnc_credit, sim_credit = EXCLUDED.sim_credit,
        al_credit = EXCLUDED.al_credit, ol_credit = EXCLUDED.ol_credit,
        freighter_credit = EXCLUDED.freighter_credit, layover_day = EXCLUDED.layover_day,
        lh_per_diem = EXCLUDED.lh_per_diem, sby_dp = EXCLUDED.sby_dp, dhd_dp = EXCLUDED.dhd_dp,
        sch_credit = EXCLUDED.sch_credit,
        int_blh = EXCLUDED.int_blh, flt_num = EXCLUDED.flt_num,
        cross_tz_duty_count = EXCLUDED.cross_tz_duty_count,
        layover_times = EXCLUDED.layover_times, layover_duration = EXCLUDED.layover_duration,
        archived_from_daily = false, updated_by = 'F8_IMPORT', updated_at = now()
    `)
  }
  return rows.length
}

async function upsertFdYearly(db: Db, rows: ReturnType<typeof partitionManday>['yearly']): Promise<number> {
  if (rows.length === 0) return 0
  for (const r of rows) {
    await db.execute(sql`
      INSERT INTO crew_manday_fd_yearly (
        crew_id, year,
        ft, augument_ft, double_ft, blh, augument_blh, double_blh,
        fdp, dp, night_dp, travel, credit,
        is_leave, is_day_off, standby, act_take_offs, act_landings,
        per_diem, updowns, cat2_updowns, exp_blh, high_plateau,
        takeoff, landing, working_hour, pnc_credit, lh_per_diem,
        layover_day, int_blh, flt_num,
        archived_from_monthly, updated_by, updated_at
      ) VALUES (
        ${r['crewId']}, ${r['year']},
        ${r['ft'] ?? 0}, ${r['augumentFt'] ?? 0}, ${r['doubleFt'] ?? 0},
        ${r['blh'] ?? 0}, ${r['augumentBlh'] ?? 0}, ${r['doubleBlh'] ?? 0},
        ${r['fdp'] ?? 0}, ${r['dp'] ?? 0}, ${r['nightDp'] ?? 0},
        ${r['travel'] ?? 0}, ${r['credit'] ?? 0},
        ${r['isLeave'] ?? 0}, ${r['isDayOff'] ?? 0}, ${r['standby'] ?? 0},
        ${r['actTakeOffs'] ?? 0}, ${r['actLandings'] ?? 0},
        ${r['perDiem'] ?? 0}, ${r['updowns'] ?? 0}, ${r['cat2Updowns'] ?? 0},
        ${r['expBlh'] ?? 0}, ${r['highPlateau'] ?? 0},
        ${r['takeoff'] ?? 0}, ${r['landing'] ?? 0},
        ${r['workingHour'] ?? null}, ${r['pncCredit'] ?? null}, ${r['lhPerDiem'] ?? null},
        ${r['layoverDay'] ?? null}, ${r['intBlh'] ?? null}, ${r['fltNum'] ?? null},
        false, 'F8_IMPORT', now()
      )
      ON CONFLICT (crew_id, year) DO UPDATE SET
        ft = EXCLUDED.ft, augument_ft = EXCLUDED.augument_ft, double_ft = EXCLUDED.double_ft,
        blh = EXCLUDED.blh, augument_blh = EXCLUDED.augument_blh, double_blh = EXCLUDED.double_blh,
        fdp = EXCLUDED.fdp, dp = EXCLUDED.dp, night_dp = EXCLUDED.night_dp,
        travel = EXCLUDED.travel, credit = EXCLUDED.credit,
        is_leave = EXCLUDED.is_leave, is_day_off = EXCLUDED.is_day_off, standby = EXCLUDED.standby,
        act_take_offs = EXCLUDED.act_take_offs, act_landings = EXCLUDED.act_landings,
        per_diem = EXCLUDED.per_diem, updowns = EXCLUDED.updowns, cat2_updowns = EXCLUDED.cat2_updowns,
        exp_blh = EXCLUDED.exp_blh, high_plateau = EXCLUDED.high_plateau,
        takeoff = EXCLUDED.takeoff, landing = EXCLUDED.landing, working_hour = EXCLUDED.working_hour,
        pnc_credit = EXCLUDED.pnc_credit, lh_per_diem = EXCLUDED.lh_per_diem,
        layover_day = EXCLUDED.layover_day, int_blh = EXCLUDED.int_blh, flt_num = EXCLUDED.flt_num,
        archived_from_monthly = false, updated_by = 'F8_IMPORT', updated_at = now()
    `)
  }
  return rows.length
}

// ---------------------------------------------------------------------------
// CC/AM upserts
// ---------------------------------------------------------------------------

async function upsertCcDaily(db: Db, rows: ReturnType<typeof partitionManday>['daily']): Promise<number> {
  if (rows.length === 0) return 0
  for (const r of rows) {
    await db.execute(sql`
      INSERT INTO crew_manday_cc_am_daily (
        crew_id, crew_base_dt,
        ft, blh, fdp, dp, cust_dp, night_dp, travel, credit, fatigue,
        is_leave, is_day_off, standby, ground, per_diem, normal_wp, extend_wp,
        csb, hsb, asb, is_al, quarantine, cust_data1, cust_data2,
        high_plateau, operating_fleets, operating_airports, working_hour,
        pnc_credit, sim_credit, al_credit, ol_credit, freighter_credit,
        layover_day, lh_per_diem, sby_dp, dhd_dp, attributes,
        int_blh, flt_num, cross_tz_duty_count, layover_times, layover_duration,
        updated_by, updated_at
      ) VALUES (
        ${r['crewId']}, ${r['crewBaseDt']},
        ${r['ft'] ?? 0}, ${r['blh'] ?? 0}, ${r['fdp'] ?? 0}, ${r['dp'] ?? 0},
        ${r['custDp'] ?? 0}, ${r['nightDp'] ?? 0}, ${r['travel'] ?? 0},
        ${r['credit'] ?? 0}, ${r['fatigue'] ?? 0},
        ${r['isLeave'] ?? 0}, ${r['isDayOff'] ?? 0}, ${r['standby'] ?? 0}, ${r['ground'] ?? 0},
        ${r['perDiem'] ?? 0}, ${r['normalWp'] ?? 0}, ${r['extendWp'] ?? 0},
        ${r['csb'] ?? 0}, ${r['hsb'] ?? 0}, ${r['asb'] ?? 0}, ${r['isAl'] ?? 0},
        ${r['quarantine'] ?? 0}, ${r['custData1'] ?? null}, ${r['custData2'] ?? null},
        ${r['highPlateau'] ?? 0}, ${r['operatingFleets'] ?? null}, ${r['operatingAirports'] ?? null},
        ${r['workingHour'] ?? 0},
        ${r['pncCredit'] ?? null}, ${r['simCredit'] ?? null}, ${r['alCredit'] ?? null},
        ${r['olCredit'] ?? null}, ${r['freighterCredit'] ?? null},
        ${r['layoverDay'] ?? null}, ${r['lhPerDiem'] ?? null},
        ${r['sbyDp'] ?? 0}, ${r['dhdDp'] ?? 0}, ${r['attributes'] ?? null},
        ${r['intBlh'] ?? null}, ${r['fltNum'] ?? null},
        ${r['crossTzDutyCount'] ?? null}, ${r['layoverTimes'] ?? null}, ${r['layoverDuration'] ?? null},
        'F8_IMPORT', now()
      )
      ON CONFLICT (crew_id, crew_base_dt) DO UPDATE SET
        ft = EXCLUDED.ft, blh = EXCLUDED.blh, fdp = EXCLUDED.fdp, dp = EXCLUDED.dp,
        cust_dp = EXCLUDED.cust_dp, night_dp = EXCLUDED.night_dp, travel = EXCLUDED.travel,
        credit = EXCLUDED.credit, fatigue = EXCLUDED.fatigue,
        is_leave = EXCLUDED.is_leave, is_day_off = EXCLUDED.is_day_off, standby = EXCLUDED.standby,
        ground = EXCLUDED.ground, per_diem = EXCLUDED.per_diem,
        normal_wp = EXCLUDED.normal_wp, extend_wp = EXCLUDED.extend_wp,
        csb = EXCLUDED.csb, hsb = EXCLUDED.hsb, asb = EXCLUDED.asb, is_al = EXCLUDED.is_al,
        quarantine = EXCLUDED.quarantine, cust_data1 = EXCLUDED.cust_data1, cust_data2 = EXCLUDED.cust_data2,
        high_plateau = EXCLUDED.high_plateau,
        operating_fleets = EXCLUDED.operating_fleets, operating_airports = EXCLUDED.operating_airports,
        working_hour = EXCLUDED.working_hour,
        pnc_credit = EXCLUDED.pnc_credit, sim_credit = EXCLUDED.sim_credit,
        al_credit = EXCLUDED.al_credit, ol_credit = EXCLUDED.ol_credit,
        freighter_credit = EXCLUDED.freighter_credit, layover_day = EXCLUDED.layover_day,
        lh_per_diem = EXCLUDED.lh_per_diem, sby_dp = EXCLUDED.sby_dp, dhd_dp = EXCLUDED.dhd_dp,
        attributes = EXCLUDED.attributes, int_blh = EXCLUDED.int_blh, flt_num = EXCLUDED.flt_num,
        cross_tz_duty_count = EXCLUDED.cross_tz_duty_count,
        layover_times = EXCLUDED.layover_times, layover_duration = EXCLUDED.layover_duration,
        updated_by = 'F8_IMPORT', updated_at = now()
    `)
  }
  return rows.length
}

async function upsertCcMonthly(db: Db, rows: ReturnType<typeof partitionManday>['monthly']): Promise<number> {
  if (rows.length === 0) return 0
  for (const r of rows) {
    await db.execute(sql`
      INSERT INTO crew_manday_cc_am_period (
        crew_id, roster_period, rp_start, rp_end,
        ft, blh, fdp, dp, cust_dp, night_dp, travel, credit,
        is_leave, is_day_off, standby, ground, per_diem, normal_wp, extend_wp,
        working_hour, pnc_credit, lh_per_diem, layover_day,
        int_blh, flt_num, cross_tz_duty_count,
        archived_from_daily, updated_by, updated_at
      ) VALUES (
        ${r['crewId']}, ${r['rosterPeriod']}, ${r['rpStart']}, ${r['rpEnd']},
        ${r['ft'] ?? 0}, ${r['blh'] ?? 0}, ${r['fdp'] ?? 0}, ${r['dp'] ?? 0},
        ${r['custDp'] ?? 0}, ${r['nightDp'] ?? 0}, ${r['travel'] ?? 0}, ${r['credit'] ?? 0},
        ${r['isLeave'] ?? 0}, ${r['isDayOff'] ?? 0}, ${r['standby'] ?? 0}, ${r['ground'] ?? 0},
        ${r['perDiem'] ?? 0}, ${r['normalWp'] ?? 0}, ${r['extendWp'] ?? 0},
        ${r['workingHour'] ?? 0}, ${r['pncCredit'] ?? null}, ${r['lhPerDiem'] ?? null},
        ${r['layoverDay'] ?? null},
        ${r['intBlh'] ?? null}, ${r['fltNum'] ?? null},
        ${r['crossTzDutyCount'] ?? null},
        false, 'F8_IMPORT', now()
      )
      ON CONFLICT (crew_id, roster_period) DO UPDATE SET
        ft = EXCLUDED.ft, blh = EXCLUDED.blh, fdp = EXCLUDED.fdp, dp = EXCLUDED.dp,
        cust_dp = EXCLUDED.cust_dp, night_dp = EXCLUDED.night_dp, travel = EXCLUDED.travel,
        credit = EXCLUDED.credit, is_leave = EXCLUDED.is_leave, is_day_off = EXCLUDED.is_day_off,
        standby = EXCLUDED.standby, ground = EXCLUDED.ground, per_diem = EXCLUDED.per_diem,
        normal_wp = EXCLUDED.normal_wp, extend_wp = EXCLUDED.extend_wp,
        working_hour = EXCLUDED.working_hour, pnc_credit = EXCLUDED.pnc_credit,
        lh_per_diem = EXCLUDED.lh_per_diem, layover_day = EXCLUDED.layover_day,
        int_blh = EXCLUDED.int_blh, flt_num = EXCLUDED.flt_num,
        cross_tz_duty_count = EXCLUDED.cross_tz_duty_count,
        archived_from_daily = false, updated_by = 'F8_IMPORT', updated_at = now()
    `)
  }
  return rows.length
}

async function upsertCcYearly(db: Db, rows: ReturnType<typeof partitionManday>['yearly']): Promise<number> {
  if (rows.length === 0) return 0
  for (const r of rows) {
    await db.execute(sql`
      INSERT INTO crew_manday_cc_am_yearly (
        crew_id, year,
        ft, blh, fdp, dp, credit,
        is_leave, is_day_off, per_diem, working_hour, pnc_credit, lh_per_diem,
        layover_day, int_blh, flt_num,
        archived_from_monthly, updated_by, updated_at
      ) VALUES (
        ${r['crewId']}, ${r['year']},
        ${r['ft'] ?? 0}, ${r['blh'] ?? 0}, ${r['fdp'] ?? 0}, ${r['dp'] ?? 0}, ${r['credit'] ?? 0},
        ${r['isLeave'] ?? 0}, ${r['isDayOff'] ?? 0}, ${r['perDiem'] ?? 0},
        ${r['workingHour'] ?? 0}, ${r['pncCredit'] ?? null}, ${r['lhPerDiem'] ?? null},
        ${r['layoverDay'] ?? null}, ${r['intBlh'] ?? null}, ${r['fltNum'] ?? null},
        false, 'F8_IMPORT', now()
      )
      ON CONFLICT (crew_id, year) DO UPDATE SET
        ft = EXCLUDED.ft, blh = EXCLUDED.blh, fdp = EXCLUDED.fdp, dp = EXCLUDED.dp,
        credit = EXCLUDED.credit, is_leave = EXCLUDED.is_leave, is_day_off = EXCLUDED.is_day_off,
        per_diem = EXCLUDED.per_diem, working_hour = EXCLUDED.working_hour,
        pnc_credit = EXCLUDED.pnc_credit, lh_per_diem = EXCLUDED.lh_per_diem,
        layover_day = EXCLUDED.layover_day, int_blh = EXCLUDED.int_blh, flt_num = EXCLUDED.flt_num,
        archived_from_monthly = false, updated_by = 'F8_IMPORT', updated_at = now()
    `)
  }
  return rows.length
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

export function startMandayInboundWorker(fastify: FastifyInstance): Worker {
  const connection = getBullmqRedisConnection()

  const worker = new Worker<MandayImportJob>(withBullmqPrefix('connector.manday.inbound'),
    async (job) => {
      const { tableType, records } = job.data
      const numericFields = tableType === 'fd' ? MANDAY_FD_NUMERIC_FIELDS : MANDAY_CC_AM_NUMERIC_FIELDS

      // Resolve roster-period ranges once per job so the period bucket is keyed by RP.
      // (recompute later re-aggregates from daily as the source of truth.)
      const rpRows = await fastify.pgPool.query<{ roster_period: string; rp_start: string; rp_end: string }>(
        'SELECT roster_period, rp_start, rp_end FROM roster_period ORDER BY rp_start',
      )
      const rpRanges: RpRange[] = rpRows.rows.map((r) => ({
        rosterPeriod: r.roster_period,
        rpStart: new Date(r.rp_start).toISOString().slice(0, 10),
        rpEnd: new Date(r.rp_end).toISOString().slice(0, 10),
      }))

      // partitionManday splits daily rows into daily / period(RP) / yearly(calendar) buckets
      const { daily, monthly, yearly } = partitionManday(
        (records as Array<MandayFdRecord | MandayCcAmRecord>).map((r) => ({
          ...r,
          crewBaseDt: r.crewBaseDt,
        })),
        numericFields,
        rpRanges,
      )

      let dCount = 0
      let mCount = 0
      let yCount = 0

      if (tableType === 'fd') {
        ;[dCount, mCount, yCount] = await Promise.all([
          upsertFdDaily(fastify.db, daily),
          upsertFdMonthly(fastify.db, monthly),
          upsertFdYearly(fastify.db, yearly),
        ])
      } else {
        ;[dCount, mCount, yCount] = await Promise.all([
          upsertCcDaily(fastify.db, daily),
          upsertCcMonthly(fastify.db, monthly),
          upsertCcYearly(fastify.db, yearly),
        ])
      }

      fastify.log.info(
        { tableType, daily: dCount, monthly: mCount, yearly: yCount },
        'Manday import complete',
      )

      const [startDt, endDt] = job.data.syncRangeDt
      await refreshMandayAfterImport(fastify, {
        startDt,
        endDt,
        updatedBy: 'MANDAY_IMPORT',
        logMessage: 'manday recompute after manday import completed',
      })
    },
    {
      connection,
      concurrency: 2,
    },
  )

  worker.on('failed', (job, err) => {
    fastify.log.error({ jobId: job?.id, err: err.message }, 'Manday inbound job failed')
  })
  attachBullmqErrorLogger(worker, fastify.log, 'manday-inbound worker')

  return worker
}
