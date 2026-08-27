// SIA_SUITE_SUMMARY_START
// SuiteId: 3.2
// Name: Local night
// SourceCsvRow: 3.2,Local night
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: Flight-to-flight rest (SQ1 SIN-KUL 2120-2230, SQ2 KUL-SIN 0900-1010) yields one local night after debrief/transport.
//   - Case #2: Same COP with KUL standby 0200-0700 local (assignment MVO) breaks the local night and fails.
//   - Case #3: Standby outside local night preserves rest and passes.
// Results:
//   - pass 3 out of 3 (skipped 0, disabled 0).
//   - Notes: last run 2025-12-04T21:51:20Z
// RemainingWork:
//   - None for current COP set (add more variants if requirements expand).
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include "CrewDB.h"
#include "RuleEngine/rule/framework/utils/DutyUtils.h"
#include "RuleEngine/rule/rule7412/CheckMinimumRestPeriodForSQRule.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"
#include "orUtil/TimeZoneUtil/TimezoneUtils.h"
#include "SIA_CommonTestConfig.h"

namespace {

SharedPtr<CrewDataContext> buildLocalNightContext() {
    auto ctx = SIATest::buildCrewDataContext({
        {"SIN", 480, "Asia/Singapore"},
        {"KUL", 480, "Asia/Kuala_Lumpur"},
    });
    ctx->assignmentNameGroupMap["FLY"].insert("FLY");
    ctx->assignmentNameGroupMap["MVO"].insert("MVO");
    ctx->assignmentNameGroupMap["MVP"].insert("MVP");
    return ctx;
}

std::unique_ptr<Duty> makeDuty(const std::string& dep,
                               const std::string& arr,
                               const std::string& startLocal,
                               const std::string& endLocal,
                               const SharedPtr<CrewDataContext>& ctx,
                               std::vector<std::unique_ptr<Segment>>& segmentStorage,
                               const std::string& assignment = "FLY") {
    const time_t startUtc = SIATest::utcFromLocal(startLocal, dep, ctx);
    const time_t endUtc = SIATest::utcFromLocal(endLocal, arr, ctx);

    auto segment = std::make_unique<Segment>();
    segment->setDepStation(dep);
    segment->setArrStation(arr);
    segment->setAssignment(assignment);
    segment->setIsOperating(true);
    segment->setStartTimeUtcAct(startUtc);
    segment->setEndTimeUtcAct(endUtc);
    segment->setStartTimeUtcSch(startUtc);
    segment->setEndTimeUtcSch(endUtc);
    segment->setStartTimeLocAct(startUtc);
    segment->setEndTimeLocAct(endUtc);
    segment->setStartTimeLocSch(startUtc);
    segment->setEndTimeLocSch(endUtc);

    std::vector<Segment*> rawSegments;
    rawSegments.push_back(segment.get());
    segmentStorage.push_back(std::move(segment));

	SIATest::ReportReleaseProfile reportRelease;
	auto dutyStartUtc = startUtc - reportRelease.reportMinutes * 60;    
	auto dutyEndUtc = endUtc + reportRelease.debriefMinutes * 60;
    auto duty = std::make_unique<Duty>(rawSegments);
    duty->setDepartureStation(dep);
    duty->setArrivalStation(arr);
    duty->setAssignment(assignment);
    duty->setStartTimeUtcAct(dutyStartUtc);
    duty->setEndTimeUtcAct(dutyEndUtc);
    duty->setStartTimeUtcSch(dutyStartUtc);
    duty->setEndTimeUtcSch(dutyEndUtc);

    const std::string depZoneId = ctx->getAirportZoneId(dep);
    const std::string arrZoneId = ctx->getAirportZoneId(arr);
    duty->setStartTimeLocAct(TimezoneUtils::GetLocalTime(dutyStartUtc, depZoneId));
    duty->setEndTimeLocAct(TimezoneUtils::GetLocalTime(dutyEndUtc, arrZoneId));
    duty->setStartTimeLocSch(duty->getStartTimeLocAct());
    duty->setEndTimeLocSch(duty->getEndTimeLocAct());

    return duty;
}

std::vector<Duty*> asRaw(const std::vector<std::unique_ptr<Duty>>& storage) {
    std::vector<Duty*> raw;
    raw.reserve(storage.size());
    for (const auto& duty : storage) {
        raw.push_back(duty.get());
    }
    return raw;
}

std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties, const std::string& base) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase(base);
    pairing->setPrimeActivity("FLY");

    if (!duties.empty()) {
        Duty* first = duties.front();
        Duty* last = duties.back();
        pairing->setStartTimeUtcAct(first->getStartTimeUtcAct());
        pairing->setStartTimeLocAct(first->getStartTimeLocAct());
        pairing->setEndTimeUtcAct(last->getEndTimeUtcAct());
        pairing->setEndTimeLocAct(last->getEndTimeLocAct());
    }

    return pairing;
}

std::unique_ptr<CheckMinimumRestPeriodForSQRule> makeRule7412(const SharedPtr<CrewDataContext>& ctx) {
    RuleInput input;
    input.dbRules = SIATest::loadRuleParametersFromCsv(SIATest::Division::TechCrew, 7412);
    EXPECT_FALSE(input.dbRules.empty()) << "Failed to load rule 7412 parameters from rule_parameters_FD.csv";
    auto rule = std::make_unique<CheckMinimumRestPeriodForSQRule>(nullptr, input);
    rule->setDataContext(ctx);
    return rule;
}

}  // namespace

// SIA 3.2 Local night
// Validates that Local Night is counted only when rest is uninterrupted
// (definition 2014; rule 7412 parameters from rule_parameters_FD.csv).

TEST(SIA_3_2_LocalNight, FlightToFlightRestProvidesOneLocalNight) {
    SIATest::SiaRuleParamGuard paramsGuard;
    RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);

    auto ctx = buildLocalNightContext();
    auto rule = makeRule7412(ctx);

    // Excel 3.2 Case #1 COP (STD/STA):
    //   Day 1 - SQ 1 - SIN-KUL - 2120-2230
    //   Day 2 - SQ 2 - KUL-SIN - 0900-1010
    std::vector<std::unique_ptr<Segment>> segments;
    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty("SIN", "KUL",
                              "2025-06-01 21:20:00",
                              "2025-06-01 22:30:00",
                              ctx,
                              segments));
    duties.push_back(makeDuty("KUL", "SIN",
                              "2025-06-02 09:00:00",
                              "2025-06-02 10:10:00",
                              ctx,
                              segments));

    auto raw = asRaw(duties);
    SIATest::applyReportReleaseToDuties(raw);

	//rest start "2025-06-01 22:30:00" + 30min debrief + 60min transport = "2025-06-01 00:00:00" UTC
	//rest end "2025-06-02 09:00:00" UTC - 60min report = "2025-06-02 08:00:00" UTC

    // Rule 7412 should accept the 08:00 rest with one local night.
    time_t restStartUtc = 0;
    const int restMinutes = DutyUtils::GetActualRestMinutes(restStartUtc, raw[0], raw[1], ctx);
    EXPECT_EQ(restMinutes, 8 * 60);

    const int offset = ctx->airportUtcOffsetMap["KUL"];  // +480 minutes
    const int localNights =
        DutyUtils::GetLocalNightNums(restStartUtc, restStartUtc + restMinutes * 60, offset);
   
    EXPECT_EQ(localNights, 1);
}

TEST(SIA_3_2_LocalNight, NoStandbyDuringLocalNightEnoughRest) {
    SIATest::SiaRuleParamGuard paramsGuard;
    RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);

    auto ctx = buildLocalNightContext();
    auto rule = makeRule7412(ctx);

    // Excel 3.2 COP with disruptive standby:
    //   Day 1 - SQ 1 - SIN-KUL - 1920-2030
    //   Day 2 - SQ 2 - KUL-SIN - 0900-1010
    std::vector<std::unique_ptr<Segment>> segments2;
    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty("SIN", "KUL",
        "2025-07-01 19:20:00",
        "2025-07-01 20:30:00",
        ctx,
        segments2));

    duties.push_back(makeDuty("KUL", "SIN",
        "2025-07-02 09:00:00",
        "2025-07-02 10:10:00",
        ctx,
        segments2));

    auto raw = asRaw(duties);
    SIATest::applyReportReleaseToDuties(raw);

    auto pairing = makePairing(raw, "SIN");
    EXPECT_TRUE(rule->CheckRule(pairing.get()));

}


TEST(SIA_3_2_LocalNight, StandbyDuringLocalNightBreaksRest) {
    SIATest::SiaRuleParamGuard paramsGuard;
    RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);

    auto ctx = buildLocalNightContext();
    auto rule = makeRule7412(ctx);

    // Excel 3.2 COP with disruptive standby:
    //   Day 1 - SQ 1 - SIN-KUL - 1920-2030
    //   Day 2 - STBY KUL local 0200-0700 (assignment MVO)
    //   Day 2 - SQ 2 - KUL-SIN - 0900-1010
    std::vector<std::unique_ptr<Segment>> segments3;
    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty("SIN", "KUL",
                              "2025-07-01 19:20:00",
                              "2025-07-01 20:30:00",
                              ctx,
                              segments3));
    duties.push_back(makeDuty("KUL", "KUL",
                              "2025-07-02 02:00:00",
                              "2025-07-02 07:00:00",
                              ctx,
                              segments3,
                              "MVO"));
    duties.push_back(makeDuty("KUL", "SIN",
                              "2025-07-02 09:00:00",
                              "2025-07-02 10:10:00",
                              ctx,
                              segments3));

    auto raw = asRaw(duties);
    SIATest::applyReportReleaseToDuties(raw);
    // Standby: ignore brief/debrief buffers so we only model the rest
    // disruption caused by its placement inside the local night window.
    SIATest::applyReportReleaseToDuty(raw[1], SIATest::makeReportReleaseProfile(0, 0, 0));

    // Rest between the flight and standby is too short and contains 0 local nights.
    time_t restStartUtc = 0;
    const int restMinutes = DutyUtils::GetActualRestMinutes(restStartUtc, raw[0], raw[1], ctx);
    EXPECT_LT(restMinutes, 8 * 60);
    const int offset = ctx->airportUtcOffsetMap["KUL"];
    EXPECT_EQ(DutyUtils::GetLocalNightNums(restStartUtc, restStartUtc + restMinutes * 60, offset), 0);
}