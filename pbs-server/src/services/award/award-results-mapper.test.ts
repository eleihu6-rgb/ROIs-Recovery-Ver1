import assert from "node:assert/strict";
import test from "node:test";
import { buildAwardCurrentResponse } from "./award-results-mapper.js";
import type { AwardResultRow, AwardRosterRow } from "./types.js";

const buildRosterRow = (overrides: Partial<AwardRosterRow>): AwardRosterRow => ({
  publish_id: "1",
  roster_id: "101",
  crew_id: "13401",
  pairing_id: null,
  pairing_label: null,
  assignment_group: "FLY",
  assignment: "FLY",
  label: null,
  flt_id: null,
  flt_dt: null,
  start_utc: null,
  end_utc: null,
  dep_arp: null,
  arv_arp: null,
  position: null,
  acting_rank: null,
  active_rank: null,
  duty_seq: null,
  seg_seq: null,
  seq_order: null,
  sch_credit_minutes: null,
  act_credit_minutes: null,
  tafb_days: null,
  base: "YVR",
  fleet: "737",
  fleet_seg: null,
  comments: null,
  source: null,
  request_source: null,
  request_id: null,
  ...overrides,
});

test("buildAwardCurrentResponse groups roster publish legs into pairing, day off, and activity items", () => {
  const rosterRows: AwardRosterRow[] = [
    buildRosterRow({
      publish_id: "1",
      roster_id: "101",
      pairing_id: "2001",
      pairing_label: "V4558",
      label: "F8808 YVR-YYC",
      flt_id: "8808",
      flt_dt: "2026-06-01",
      start_utc: "2026-06-01 00:20:00",
      end_utc: "2026-06-01 01:50:00",
      dep_arp: "YVR",
      arv_arp: "YYC",
      position: "FA",
      duty_seq: 1,
      seg_seq: 1,
      sch_credit_minutes: "90",
      fleet_seg: "7M8",
      tafb_days: "640",
    }),
    buildRosterRow({
      publish_id: "2",
      roster_id: "102",
      pairing_id: "2001",
      pairing_label: "V4558",
      label: "F8809 YYC-YVR",
      flt_id: "8809",
      flt_dt: "2026-06-01",
      start_utc: "2026-06-01 02:20:00",
      end_utc: "2026-06-01 03:55:00",
      dep_arp: "YYC",
      arv_arp: "YVR",
      duty_seq: 2,
      seg_seq: 1,
      sch_credit_minutes: "95",
      fleet_seg: "7M8",
      tafb_days: "640",
    }),
    buildRosterRow({
      publish_id: "3",
      roster_id: "103",
      assignment_group: "DO",
      assignment: "DO",
      label: "GDO",
      flt_dt: "2026-06-03",
      start_utc: "2026-06-03 00:00:00",
      end_utc: "2026-06-04 00:00:00",
    }),
    buildRosterRow({
      publish_id: "4",
      roster_id: "104",
      assignment_group: "TRAIN",
      assignment: "SIM",
      label: "SIM",
      flt_dt: "2026-06-05",
      start_utc: "2026-06-05 12:00:00",
      end_utc: "2026-06-05 16:00:00",
      sch_credit_minutes: "240",
    }),
  ];
  const awardRows: AwardResultRow[] = [
    {
      awarded_tier: "4",
      status: "PUBLISHED",
      published_at: "2026-06-15 00:00:00",
      item_type: "pairing",
      pairing_id: "2001",
      date_off: null,
      matched_tier: "2",
      rejection_reason: null,
    },
  ];

  const response = buildAwardCurrentResponse({
    periodCode: "Jun 2026",
    rosterRows,
    awardRows,
  });

  assert.equal(response.summary.tier, "T4");
  assert.equal(response.summary.pairingCount, 1);
  assert.equal(response.summary.offDays, 1);
  assert.equal(response.summary.activityCount, 1);
  assert.equal(response.summary.creditMinutes, 425);
  assert.equal(response.reasonReport.available, false);
  assert.deepEqual(response.reasonReport.items, []);
  assert.equal(response.items[0]?.label, "V4558");
  assert.equal(response.items[0]?.matchedTier, "T2");
  assert.equal(response.items[0]?.position, "FA");
  assert.equal(response.items[0]?.legs.length, 2);
  assert.equal(response.items[0]?.legs[0]?.equipment, "7M8");
  assert.equal(response.items[0]?.legs[0]?.equipmentMissing, false);
  assert.equal(response.items[0]?.legEquipmentMissingReason, null);
  assert.equal(response.calendar.events[0]?.label, "V4558");
  assert.equal(response.calendar.events[1]?.label, "DO");
  assert.equal(response.calendar.events[2]?.tone, "yellow");
});

test("buildAwardCurrentResponse merges continuous ground tasks only in calendar events", () => {
  const rosterRows = Array.from({ length: 5 }, (_, index) => {
    const startDay = 22 + index;
    const endDay = startDay + 1;

    return buildRosterRow({
      publish_id: String(index + 1),
      roster_id: String(101 + index),
      assignment_group: "LEAVE",
      assignment: "VAC",
      label: "VAC",
      flt_dt: `2026-06-${String(startDay).padStart(2, "0")}`,
      start_utc: `2026-06-${String(startDay).padStart(2, "0")} 00:00:00`,
      end_utc: `2026-06-${String(endDay).padStart(2, "0")} 00:00:00`,
      sch_credit_minutes: "240",
    });
  });

  const response = buildAwardCurrentResponse({
    periodCode: "Jun 2026",
    rosterRows,
    awardRows: [],
  });

  assert.equal(response.items.length, 5);
  assert.equal(response.summary.activityCount, 5);
  assert.equal(response.summary.creditMinutes, 1_200);
  assert.deepEqual(response.calendar.events, [
    {
      id: "calendar-activity-VAC-2026-06-22T0000-2026-06-27T0000-101",
      type: "activity",
      label: "VAC",
      startDate: "2026-06-22",
      endDate: "2026-06-27",
      startTime: "0000",
      endTime: "0000",
      tone: "yellow",
      readonly: true,
      sourceItemIds: [
        "activity-2026-06-22-VAC",
        "activity-2026-06-23-VAC",
        "activity-2026-06-24-VAC",
        "activity-2026-06-25-VAC",
        "activity-2026-06-26-VAC",
      ],
      metadata: {
        pairingId: null,
        pairingCode: null,
        matchedTier: null,
      },
    },
  ]);
});

test("buildAwardCurrentResponse treats the published one-minute day-off boundary as continuous", () => {
  const response = buildAwardCurrentResponse({
    periodCode: "Jun 2026",
    rosterRows: [
      buildRosterRow({
        publish_id: "1",
        roster_id: "101",
        assignment_group: "DO",
        assignment: "DO",
        label: "GDO",
        flt_dt: "2026-06-01",
        start_utc: "2026-06-01 04:01:00",
        end_utc: "2026-06-02 04:00:00",
      }),
      buildRosterRow({
        publish_id: "2",
        roster_id: "102",
        assignment_group: "DO",
        assignment: "DO",
        label: "GDO",
        flt_dt: "2026-06-02",
        start_utc: "2026-06-02 04:01:00",
        end_utc: "2026-06-03 04:00:00",
      }),
    ],
    awardRows: [],
  });

  assert.equal(response.items.length, 2);
  assert.equal(response.summary.offDays, 2);
  assert.equal(response.calendar.events.length, 1);
  assert.equal(response.calendar.events[0]?.startDate, "2026-06-01");
  assert.equal(response.calendar.events[0]?.endDate, "2026-06-03");
  assert.deepEqual(response.calendar.events[0]?.sourceItemIds, [
    "day-off-2026-06-01",
    "day-off-2026-06-02",
  ]);
});

test("buildAwardCurrentResponse preserves real gaps between same-code ground tasks", () => {
  const response = buildAwardCurrentResponse({
    periodCode: "Jun 2026",
    rosterRows: [
      buildRosterRow({
        publish_id: "1",
        roster_id: "101",
        assignment_group: "LEAVE",
        assignment: "VAC",
        label: "VAC",
        flt_dt: "2026-06-22",
        start_utc: "2026-06-22 00:00:00",
        end_utc: "2026-06-22 04:00:00",
      }),
      buildRosterRow({
        publish_id: "2",
        roster_id: "102",
        assignment_group: "LEAVE",
        assignment: "VAC",
        label: "VAC",
        flt_dt: "2026-06-22",
        start_utc: "2026-06-22 12:00:00",
        end_utc: "2026-06-22 16:00:00",
      }),
    ],
    awardRows: [],
  });

  assert.equal(response.items.length, 1);
  assert.deepEqual(
    response.calendar.events.map((event) => [event.startTime, event.endTime]),
    [["0000", "0400"], ["1200", "1600"]],
  );
});

test("buildAwardCurrentResponse does not duplicate calendar events when a ground item has unreliable time", () => {
  const response = buildAwardCurrentResponse({
    periodCode: "Jun 2026",
    rosterRows: [
      buildRosterRow({
        publish_id: "1",
        roster_id: "101",
        assignment_group: "LEAVE",
        assignment: "VAC",
        label: "VAC",
        flt_dt: "2026-06-22",
        start_utc: "2026-06-22 00:00:00",
        end_utc: "2026-06-22 04:00:00",
      }),
      buildRosterRow({
        publish_id: "2",
        roster_id: "102",
        assignment_group: "LEAVE",
        assignment: "VAC",
        label: "VAC",
        flt_dt: "2026-06-22",
        start_utc: "2026-06-22 12:00:00",
        end_utc: null,
      }),
    ],
    awardRows: [],
  });

  assert.equal(response.items.length, 1);
  assert.equal(response.calendar.events.length, 1);
  assert.equal(response.calendar.events[0]?.id, "activity-2026-06-22-VAC");
});

test("buildAwardCurrentResponse never joins different pairing ids", () => {
  const response = buildAwardCurrentResponse({
    periodCode: "Jun 2026",
    rosterRows: [
      buildRosterRow({
        publish_id: "1",
        roster_id: "101",
        pairing_id: "3001",
        pairing_label: "T4501",
        start_utc: "2026-06-10 12:00:00",
        end_utc: "2026-06-11 10:00:00",
      }),
      buildRosterRow({
        publish_id: "2",
        roster_id: "102",
        pairing_id: "3002",
        pairing_label: "T4502",
        start_utc: "2026-06-11 10:00:00",
        end_utc: "2026-06-12 13:00:00",
      }),
    ],
    awardRows: [],
  });

  assert.deepEqual(
    response.calendar.events.map((event) => [
      event.id,
      event.startDate,
      event.endDate,
      event.sourceItemIds,
    ]),
    [
      ["pairing-3001", "2026-06-10", "2026-06-11", ["pairing-3001"]],
      ["pairing-3002", "2026-06-11", "2026-06-12", ["pairing-3002"]],
    ],
  );
});

test("buildAwardCurrentResponse deduplicates pairing credit by duty_seq and uses acting rank from publish snapshot", () => {
  const response = buildAwardCurrentResponse({
    periodCode: "Jun 2026",
    rosterRows: [
      buildRosterRow({
        publish_id: "1",
        roster_id: "101",
        pairing_id: "4109",
        pairing_label: "V4109",
        label: "F82854 YVR-GDL",
        flt_id: "2854",
        flt_dt: "2026-06-02",
        start_utc: "2026-06-02 16:40:00",
        end_utc: "2026-06-02 21:38:00",
        dep_arp: "YVR",
        arv_arp: "GDL",
        acting_rank: "CA",
        position: null,
        duty_seq: 1,
        seg_seq: 1,
        sch_credit_minutes: "630",
      }),
      buildRosterRow({
        publish_id: "2",
        roster_id: "102",
        pairing_id: "4109",
        pairing_label: "V4109",
        label: "F82855 GDL-YVR",
        flt_id: "2855",
        flt_dt: "2026-06-02",
        start_utc: "2026-06-02 22:40:00",
        end_utc: "2026-06-03 04:07:00",
        dep_arp: "GDL",
        arv_arp: "YVR",
        acting_rank: "CA",
        position: null,
        duty_seq: 1,
        seg_seq: 2,
        sch_credit_minutes: "630",
      }),
    ],
    awardRows: [],
  });

  assert.equal(response.items[0]?.creditMinutes, 630);
  assert.equal(response.items[0]?.creditMissingReason, null);
  assert.equal(response.items[0]?.position, "CA");
  assert.equal(response.summary.creditMinutes, 630);
});

test("buildAwardCurrentResponse uses actual credit consistently when scheduled credit differs", () => {
  const response = buildAwardCurrentResponse({
    periodCode: "Jun 2026",
    rosterRows: [
      buildRosterRow({
        publish_id: "1",
        roster_id: "101",
        pairing_id: "10924",
        pairing_label: "T4528",
        label: "F8633 YYZ-YEG",
        flt_id: "8633",
        flt_dt: "2026-06-04",
        start_utc: "2026-06-04 14:03:00",
        end_utc: "2026-06-04 18:04:00",
        dep_arp: "YYZ",
        arv_arp: "YEG",
        duty_seq: 1,
        seg_seq: 1,
        sch_credit_minutes: "470",
        act_credit_minutes: "485",
        fleet_seg: "7M8",
      }),
      buildRosterRow({
        publish_id: "2",
        roster_id: "102",
        pairing_id: "10924",
        pairing_label: "T4528",
        label: "F8632 YEG-YYZ",
        flt_id: "8632",
        flt_dt: "2026-06-04",
        start_utc: "2026-06-04 19:01:00",
        end_utc: "2026-06-04 22:49:00",
        dep_arp: "YEG",
        arv_arp: "YYZ",
        duty_seq: 1,
        seg_seq: 2,
        sch_credit_minutes: "470",
        act_credit_minutes: "485",
        fleet_seg: "7M8",
      }),
    ],
    awardRows: [],
  });

  assert.equal(response.items[0]?.creditMinutes, 485);
  assert.deepEqual(response.items[0]?.legs.map((leg) => leg.creditMinutes), [485, 485]);
  assert.deepEqual(response.items[0]?.legs.map((leg) => leg.equipment), ["7M8", "7M8"]);
  assert.equal(response.items[0]?.legEquipmentMissingReason, null);
  assert.equal(response.summary.creditMinutes, 485);
});

test("buildAwardCurrentResponse exposes missing published data when duty_seq is not available for multi-leg credit", () => {
  const response = buildAwardCurrentResponse({
    periodCode: "Jun 2026",
    rosterRows: [
      buildRosterRow({
        publish_id: "1",
        roster_id: "101",
        pairing_id: "4109",
        pairing_label: "V4109",
        label: "F82854 YVR-GDL",
        flt_id: "2854",
        flt_dt: "2026-06-02",
        start_utc: "2026-06-02 16:40:00",
        end_utc: "2026-06-02 21:38:00",
        dep_arp: "YVR",
        arv_arp: "GDL",
        sch_credit_minutes: "630",
      }),
      buildRosterRow({
        publish_id: "2",
        roster_id: "102",
        pairing_id: "4109",
        pairing_label: "V4109",
        label: "F82855 GDL-YVR",
        flt_id: "2855",
        flt_dt: "2026-06-02",
        start_utc: "2026-06-02 22:40:00",
        end_utc: "2026-06-03 04:07:00",
        dep_arp: "GDL",
        arv_arp: "YVR",
        sch_credit_minutes: "630",
      }),
    ],
    awardRows: [],
  });

  assert.equal(response.items[0]?.creditMinutes, null);
  assert.equal(
    response.items[0]?.creditMissingReason,
    "Published roster snapshot is missing duty_seq, so pairing credit cannot be safely deduplicated.",
  );
  assert.equal(response.summary.creditMinutes, null);
  assert.deepEqual(response.summary.warnings, [
    "Published roster snapshot is missing duty_seq, so pairing credit cannot be safely deduplicated.",
  ]);
});

test("buildAwardCurrentResponse does not fabricate tier or reason report when award tables are empty", () => {
  const response = buildAwardCurrentResponse({
    periodCode: "Jun 2026",
    rosterRows: [
      buildRosterRow({
        publish_id: "1",
        roster_id: "101",
        pairing_id: "2001",
        pairing_label: "V4558",
        label: "F8808 YVR-YYC",
        flt_dt: "2026-06-01",
        start_utc: "2026-06-01 00:20:00",
        end_utc: "2026-06-01 01:50:00",
        duty_seq: 1,
        seg_seq: 1,
      }),
    ],
    awardRows: [],
  });

  assert.equal(response.summary.tier, null);
  assert.equal(response.items[0]?.matchedTier, null);
  assert.equal(response.reasonReport.available, false);
  assert.equal(
    response.reasonReport.disabledReason,
    "No award explanations are available for this period.",
  );
  assert.deepEqual(response.reasonReport.items, []);
  assert.deepEqual(response.summary.warnings, ["Published roster snapshot is missing duty credit minutes."]);
});

test("buildAwardCurrentResponse exposes a controlled explanation only with consistent optimizer provenance", () => {
  const controlledComment = "PBS_AWARD_V1|Matched your Tier 3 pairing preferences.";
  const buildPairingRows = (secondRowOverrides: Partial<AwardRosterRow> = {}) => [
    buildRosterRow({
      pairing_id: "2001",
      start_utc: "2026-06-01 00:20:00",
      end_utc: "2026-06-01 01:50:00",
      duty_seq: 1,
      seg_seq: 1,
      comments: controlledComment,
      source: "CR",
      request_source: "SCENARIO",
      request_id: "541",
    }),
    buildRosterRow({
      publish_id: "2",
      roster_id: "102",
      pairing_id: "2001",
      start_utc: "2026-06-01 02:20:00",
      end_utc: "2026-06-01 03:55:00",
      duty_seq: 1,
      seg_seq: 2,
      comments: controlledComment,
      source: "CR",
      request_source: "SCENARIO",
      request_id: "541",
      ...secondRowOverrides,
    }),
  ];

  const validResponse = buildAwardCurrentResponse({
    periodCode: "Jun 2026",
    rosterRows: buildPairingRows(),
    awardRows: [],
  });
  assert.equal(
    validResponse.items[0]?.explanation,
    "Matched your Tier 3 pairing preferences.",
  );
  assert.deepEqual(validResponse.reasonReport, {
    available: true,
    items: [
      {
        id: "pairing-2001",
        kind: "awarded_pairing",
        pairingId: "2001",
        pairingCode: "2001",
        startDate: "2026-06-01",
        endDate: "2026-06-01",
        explanation: "Matched your Tier 3 pairing preferences.",
      },
    ],
  });

  for (const secondRowOverrides of [
    { comments: null },
    { comments: "planner note" },
    { comments: "PBS_AWARD_V1|Matched your Tier 4 pairing preferences." },
    { source: "MA" },
    { request_source: "LIVE" },
    { request_id: null },
  ] satisfies Array<Partial<AwardRosterRow>>) {
    const response = buildAwardCurrentResponse({
      periodCode: "Jun 2026",
      rosterRows: buildPairingRows(secondRowOverrides),
      awardRows: [],
    });

    assert.equal(response.items[0]?.explanation, null);
    assert.equal(response.reasonReport.available, false);
    assert.deepEqual(response.reasonReport.items, []);
  }
});

test("buildAwardCurrentResponse sorts awarded pairing explanations without listing ground activities", () => {
  const controlledComment = "PBS_AWARD_V1|Matched your Tier 3 pairing preferences.";
  const rosterRows = [
    buildRosterRow({
      publish_id: "2",
      roster_id: "102",
      pairing_id: "3002",
      pairing_label: "V3002",
      start_utc: "2026-06-03 10:00:00",
      end_utc: "2026-06-03 12:00:00",
      duty_seq: 1,
      seg_seq: 1,
      comments: controlledComment,
      source: "CR",
      request_source: "SCENARIO",
      request_id: "541",
    }),
    buildRosterRow({
      publish_id: "1",
      roster_id: "101",
      pairing_id: "3001",
      pairing_label: null,
      start_utc: "2026-06-01 10:00:00",
      end_utc: "2026-06-01 12:00:00",
      duty_seq: 1,
      seg_seq: 1,
      comments: controlledComment,
      source: "CR",
      request_source: "SCENARIO",
      request_id: "541",
    }),
    buildRosterRow({
      publish_id: "3",
      roster_id: "103",
      assignment_group: "DO",
      assignment: "DO",
      label: "Day Off",
      start_utc: "2026-06-02 00:01:00",
      end_utc: "2026-06-03 00:00:00",
      comments: controlledComment,
      source: "CR",
      request_source: "SCENARIO",
      request_id: "541",
    }),
  ];

  const response = buildAwardCurrentResponse({
    periodCode: "Jun 2026",
    rosterRows,
    awardRows: [],
  });

  assert.deepEqual(
    response.reasonReport.items.map((item) => ({
      id: item.id,
      pairingCode: item.pairingCode,
    })),
    [
      { id: "pairing-3001", pairingCode: "3001" },
      { id: "pairing-3002", pairingCode: "V3002" },
    ],
  );
});

test("buildAwardCurrentResponse converts award roster times to the crew base timezone", () => {
  const response = buildAwardCurrentResponse({
    periodCode: "Jun 2026",
    timeZone: {
      base: "YYZ",
      zoneId: "America/Toronto",
      timezoneLabel: "YYZ Local Time",
      fallback: false,
    },
    rosterRows: [
      buildRosterRow({
        publish_id: "1",
        roster_id: "101",
        pairing_id: "3001",
        pairing_label: "T4520",
        label: "F82660 YYZ-GDL",
        flt_id: "82660",
        flt_dt: "2026-06-02",
        start_utc: "2026-06-02 13:51:00",
        end_utc: "2026-06-02 18:37:00",
        dep_arp: "YYZ",
        arv_arp: "GDL",
        duty_seq: 1,
        seg_seq: 1,
        sch_credit_minutes: null,
      }),
      buildRosterRow({
        publish_id: "2",
        roster_id: "102",
        pairing_id: "3001",
        pairing_label: "T4520",
        label: "F82661 GDL-YYZ",
        flt_id: "82661",
        flt_dt: "2026-06-02",
        start_utc: "2026-06-02 19:54:00",
        end_utc: "2026-06-03 00:49:00",
        dep_arp: "GDL",
        arv_arp: "YYZ",
        duty_seq: 2,
        seg_seq: 1,
        sch_credit_minutes: null,
      }),
      buildRosterRow({
        publish_id: "3",
        roster_id: "103",
        assignment_group: "GRD",
        assignment: "DO",
        label: "GDO",
        flt_dt: "2026-06-03",
        start_utc: "2026-06-03 04:01:00",
        end_utc: "2026-06-04 04:00:00",
        dep_arp: "YYZ",
        arv_arp: "YYZ",
        base: null,
      }),
    ],
    awardRows: [],
  });

  const pairing = response.items.find((item) => item.type === "pairing");
  const dayOff = response.items.find((item) => item.type === "day_off");

  assert.equal(response.timeZone.timezoneLabel, "YYZ Local Time");
  assert.equal(pairing?.startDate, "2026-06-02");
  assert.equal(pairing?.endDate, "2026-06-02");
  assert.equal(pairing?.startTime, "0951");
  assert.equal(pairing?.endTime, "2049");
  assert.equal(pairing?.legs[1]?.day, "02");
  assert.equal(pairing?.legs[1]?.arrTime, "2049");
  assert.equal(dayOff?.startDate, "2026-06-03");
  assert.equal(dayOff?.endDate, "2026-06-04");
  assert.equal(dayOff?.startTime, "0001");
  assert.equal(dayOff?.endTime, "0000");
  assert.equal(response.calendar.events.find((event) => event.id === "pairing-3001")?.endDate, "2026-06-02");
  assert.equal(response.calendar.events.find((event) => event.id === "day-off-2026-06-03")?.startTime, "0001");
});
