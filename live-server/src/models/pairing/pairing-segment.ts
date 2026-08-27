import { pgTable, bigint, varchar, integer, smallint, numeric, date, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { pairing } from './pairing.js'
import { flight } from '../flight/flight.js'

/**
 * pairing_segment — 环行宽表，1行=1个航班段
 *
 * 进退场字段设计说明：
 * - 原设计：每个 Duty 层级支持 3 次进退场（pickup_1/2/3, brief_1/2/3 等）
 * - 新设计：保留首次 + 第二次进退场字段，全部可空
 *
 * 业务场景：
 * 1. 正常 Duty：只需一组 Pickup/Brief（签到）+ Debrief/Dropoff（签退）
 * 2. 带休息的 Duty：先签退去酒店休息，再签回继续工作，需要两组进退场时间
 * 3. 大过站：在 Segment 层级单独签到签出（使用 double_* 字段）
 *
 * 数据赋值规则：
 * - Duty 内第一段 Segment：只赋值 pickup/brief 字段
 * - Duty 内最后一段 Segment：只赋值 debrief/dropoff 字段
 * - 发生第二次签退签到时：double_* 字段全部赋值
 * - 界面从 Duty 层级提取 Pickup/Brief/Debrief/Dropoff 时间
 * - double_* 有值时，额外渲染第二次进退场
 */
export const pairingSegment = pgTable('pairing_segment', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdBy: varchar('created_by', { length: 30 }).notNull().default('system'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedBy: varchar('updated_by', { length: 30 }).notNull().default('system'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),

  // 归属
  pairingId: bigint('pairing_id', { mode: 'number' }).notNull().references(() => pairing.id, { onDelete: 'restrict' }),

  // duty 层信息（冗余内嵌）
  dutySeq: smallint('duty_seq').notNull(),
  dutyStrArp: varchar('duty_str_arp', { length: 3 }).notNull(),
  dutyEndArp: varchar('duty_end_arp', { length: 3 }).notNull(),
  dutySchStrDtUtc: timestamp('duty_sch_str_dt_utc').notNull(),
  dutySchEndDtUtc: timestamp('duty_sch_end_dt_utc').notNull(),
  dutyActStrDtUtc: timestamp('duty_act_str_dt_utc').notNull(),
  dutyActEndDtUtc: timestamp('duty_act_end_dt_utc').notNull(),
  dutyHotelId: bigint('duty_hotel_id', { mode: 'number' }),
  dutyAssignment: varchar('duty_assignment', { length: 20 }),
  dutyBriefMin: integer('duty_brief_min'),
  dutyDebriefMin: integer('duty_debrief_min'),
  dutySchDutyMin: integer('duty_sch_duty_min'),
  dutySchFdpMin: integer('duty_sch_fdp_min'),
  dutySchFltMin: integer('duty_sch_flt_min'),
  dutySchDpMin: integer('duty_sch_dp_min'),
  dutySchRestMin: integer('duty_sch_rest_min'),
  dutySchWpMin: numeric('duty_sch_wp_min', { precision: 10, scale: 2 }),
  dutySchFmCreditedMinutes: numeric('duty_sch_fm_credited_minutes', { precision: 8, scale: 2 }),
  dutySchCreditedMinutes: numeric('duty_sch_credited_minutes', { precision: 8, scale: 2 }),
  dutyActDutyMin: integer('duty_act_duty_min'),
  dutyActFdpMin: integer('duty_act_fdp_min'),
  dutyActFltMin: integer('duty_act_flt_min'),
  dutyActDpMin: integer('duty_act_dp_min'),
  dutyActRestMin: integer('duty_act_rest_min'),
  dutyActWpMin: numeric('duty_act_wp_min', { precision: 10, scale: 2 }),
  dutyActFmCreditedMinutes: numeric('duty_act_fm_credited_minutes', { precision: 8, scale: 2 }),
  dutyActCreditedMinutes: numeric('duty_act_credited_minutes', { precision: 6, scale: 2 }),
  dutyRefTz: integer('duty_ref_tz'),
  dutyEtrTz: integer('duty_etr_tz'),
  dutyAccState: varchar('duty_acc_state', { length: 1 }).notNull().default('D'),
  dutyLayoverNits: integer('duty_layover_nits'),
  dutyFdpDiscretionMin: integer('duty_fdp_discretion_min'),
  dutyMaxFdpMin: integer('duty_max_fdp_min'),
  dutyWpAdjustment: numeric('duty_wp_adjustment', { precision: 10, scale: 2 }),
  dutyTrainingAddTime: integer('duty_training_add_time'),
  dutyIsManualModify: smallint('duty_is_manual_modify'),
  dutyIsManualMaxFdp: smallint('duty_is_manual_max_fdp'),
  dutyDiscretionType: varchar('duty_discretion_type', { length: 100 }),
  dutyComments: varchar('duty_comments', { length: 255 }),

  // ── 首次进退场信息（可空）────────────────────────────────────
  // 数据赋值规则：Duty内第一段赋值pickup/brief，最后段赋值debrief/dropoff
  pickupStartUtc: timestamp('pickup_start_utc'),
  pickupEndUtc: timestamp('pickup_end_utc'),
  briefStartUtc: timestamp('brief_start_utc'),
  briefEndUtc: timestamp('brief_end_utc'),
  debriefStartUtc: timestamp('debrief_start_utc'),
  debriefEndUtc: timestamp('debrief_end_utc'),
  dropoffStartUtc: timestamp('dropoff_start_utc'),
  dropoffEndUtc: timestamp('dropoff_end_utc'),

  // ── 第二次进退场信息（可空）──────────────────────────────────
  // 用于：带休息的Duty（先签退去酒店，再签回）或大过站场景
  // 发生第二次签退签到时，所有double_*字段赋值
  doublePickupStartUtc: timestamp('double_pickup_start_utc'),
  doublePickupEndUtc: timestamp('double_pickup_end_utc'),
  doubleBriefStartUtc: timestamp('double_brief_start_utc'),
  doubleBriefEndUtc: timestamp('double_brief_end_utc'),
  doubleDebriefStartUtc: timestamp('double_debrief_start_utc'),
  doubleDebriefEndUtc: timestamp('double_debrief_end_utc'),
  doubleDropoffStartUtc: timestamp('double_dropoff_start_utc'),
  doubleDropoffEndUtc: timestamp('double_dropoff_end_utc'),

  // 航班段信息
  segSeq: smallint('seg_seq').notNull(),
  fltId: bigint('flt_id', { mode: 'number' }).references(() => flight.id, { onDelete: 'restrict' }),
  fltDt: date('flt_dt'),
  fltNum: varchar('flt_num', { length: 100 }).notNull(),
  airline: varchar('airline', { length: 3 }).notNull(),
  depArp: varchar('dep_arp', { length: 3 }).notNull(),
  arvArp: varchar('arv_arp', { length: 3 }).notNull(),
  fleetSeg: varchar('fleet_seg', { length: 10 }).notNull(),
  actStrDtUtc: timestamp('act_str_dt_utc').notNull(),
  actEndDtUtc: timestamp('act_end_dt_utc').notNull(),
  schStrDtUtc: timestamp('sch_str_dt_utc').notNull(),
  schEndDtUtc: timestamp('sch_end_dt_utc').notNull(),
  segAssignment: varchar('seg_assignment', { length: 20 }).notNull(),
  isDeleted: smallint('is_deleted').notNull().default(0),
  isLongTransit: smallint('is_long_transit'),
  wpMinsSeg: numeric('wp_mins_seg', { precision: 10, scale: 2 }),
  actCreditedMinutesSeg: numeric('act_credited_minutes_seg', { precision: 8, scale: 2 }),
  actFmCreditedMinutesSeg: numeric('act_fm_credited_minutes_seg', { precision: 8, scale: 2 }),
  schCreditedMinutesSeg: numeric('sch_credited_minutes_seg', { precision: 8, scale: 2 }),
  schFmCreditedMinutesSeg: numeric('sch_fm_credited_minutes_seg', { precision: 8, scale: 2 }),
}, (table) => [
  uniqueIndex('uq_pair_seg').on(table.pairingId, table.dutySeq, table.segSeq),
  index('idx_pair_seg_pair_id').on(table.pairingId),
  index('idx_pair_seg_pair_duty').on(table.pairingId, table.dutySeq),
  index('idx_pair_seg_flt_id').on(table.fltId),
  index('idx_pair_seg_dep_arv').on(table.depArp, table.arvArp, table.actStrDtUtc),
])