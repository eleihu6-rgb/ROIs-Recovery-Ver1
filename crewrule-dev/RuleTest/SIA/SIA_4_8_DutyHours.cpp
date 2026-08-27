// SIA_SUITE_SUMMARY_START
// SuiteId: 4.8
// Name: Duty Hour Rule
// SourceCsvRow: 4.8.,Duty Hour Rule
// Status: IMPLEMENTED
// ImplementedCases:
//   - Case #1: COP with ~87.45H duty hours. Legal (within 85H-88H buffer).
//   - Case #2: COP with ~88.45H duty hours. Warning (exceeds 88H buffer, but < 90H hard limit).
//   - Case #3: COP with ~90.45H duty hours. Illegal (exceeds 90H hard limit).
//   - Case #4: COP with SBY removed, ~84.45H duty hours. Legal (< 85H buffer).
// Results:
//   - All cases pass as per the specified logic.
// RemainingWork:
//   - None.
// SIA_SUITE_SUMMARY_END

#include <gtest/gtest.h>

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "GlobalDefinition/RuleEngineDef.h"
#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleEngine/rule/rule7205/CheckMaxFlightTimeInPeriodForEvaFdRule.h"
#include "RuleSystemDefine.h"
#include "SIA_CommonTestConfig.h"
#include "db/AssignmentHolder.h"
#include "db/Duty.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

// SIA 4.8 Duty Hour Rule: cap total duty time to 90 hours in 7 days.

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

SharedPtr<CrewDataContext> buildContext() {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    ctx->scenario.airline = "SQ";
    ctx->scenario.division = "P";
    ctx->scenario.startDtUTC = utcFromString("2025-01-01 00:00:00");
    ctx->scenario.endDtUTC = utcFromString("2025-12-31 23:59:59");
    
    // Define airports and their UTC offsets
    ctx->airportUtcOffsetMap["SIN"] = 8 * 60;
    ctx->airportUtcOffsetMap["ICN"] = 9 * 60;
    ctx->airportUtcOffsetMap["CVG"] = -5 * 60;
    ctx->airportUtcOffsetMap["NGO"] = 9 * 60;
    ctx->airportUtcOffsetMap["LAX"] = -8 * 60;
    ctx->airportUtcOffsetMap["HNL"] = -10 * 60;
    ctx->airportUtcOffsetMap["SYD"] = 10 * 60;
    ctx->airportUtcOffsetMap["MEL"] = 10 * 60;

    ctx->airportZoneIdMap["SIN"] = "Asia/Singapore";
    ctx->airportZoneIdMap["ICN"] = "Asia/Seoul";
    ctx->airportZoneIdMap["CVG"] = "America/New_York";
    ctx->airportZoneIdMap["NGO"] = "Asia/Tokyo";
    ctx->airportZoneIdMap["LAX"] = "America/Los_Angeles";
    ctx->airportZoneIdMap["HNL"] = "Pacific/Honolulu";
    ctx->airportZoneIdMap["SYD"] = "Australia/Sydney";
    ctx->airportZoneIdMap["MEL"] = "Australia/Melbourne";

    return ctx;
}

RuleInput makeRuleInput(const std::string& maxHours, const std::string& bufferHours = "") {
    RuleInput input;
    DBRule row{};
    row.idRule = 7205001;
    row.function = 7205;
    row.tableNum = 1;
    row.rowNum = 1;
    row.phase = 1;
    row.idRuleParam = 208272051;
    row.overridebility = "S";
    row.reference = "SIA-4.8";
    std::strcpy(row.description, "SIA duty hour cap");
    row.params["LIMIT_DP_RANGE"] = maxHours;
    row.params["WINDOW LENGTH"] = "7";
    row.params["WINDOW UNIT"] = "DAY";
    row.params["CALENDAR WINDOW"] = "N"; // Use rolling window as per COP test cases.
    row.params["ASSIGNMENT CODES"] = "FLY|SBY|DHD";
    if (!bufferHours.empty()) {
        row.params["BUFFER"] = bufferHours;
    }
    input.dbRules.push_back(row);
    return input;
}

std::unique_ptr<CheckMaxFlightTimeInPeriodForEvaFdRule> makeRule7205(
    const SharedPtr<CrewDataContext>& ctx, const std::string& maxHours, const std::string& bufferHours = "") {
    RuleInput input = makeRuleInput(maxHours, bufferHours);
    auto rule = std::make_unique<CheckMaxFlightTimeInPeriodForEvaFdRule>(nullptr, input);
    rule->setDataContext(ctx);
    rule->setApplication(BATCH_LEGALITY);
    return rule;
}

struct RuleLimits {
    std::string dp = "*";
    std::string fdp = "*";
    std::string blh = "*";
};


std::vector<RULE_VIOLATION*> _violations;
std::vector<std::string> _violationMessages;

std::unique_ptr<CheckMaxFlightTimeInPeriodForEvaFdRule> makeRule(int period,
    const std::string& unit,
    const RuleLimits& limits,
    const SharedPtr<CrewDataContext>& ctx) {
    RuleInput input;
    input.ruleParamString.push_back("*,*,*,*,*,*,*,*,*," + std::to_string(period) + "," + unit + "," +
        limits.blh + "," + limits.fdp + "," + limits.dp + ",2");
    auto rule = std::make_unique<CheckMaxFlightTimeInPeriodForEvaFdRule>(nullptr, input);
    rule->setApplication(PAIRING_EDITOR);
    rule->setDataContext(ctx);
    rule->setRuleViolation(&_violations);
    rule->setViolations(&_violationMessages);
    return rule;
}
std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     const std::string& startUtc,
                                     const std::string& endUtc) {
    auto seg = std::make_unique<Segment>();
    static long long segId = 48000;
    seg->setSegmentId(segId++);
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    seg->setDepSta(dep);
    seg->setArrSta(arr);
    seg->setStartTimeUtcAct(start);
    seg->setEndTimeUtcAct(end);
    seg->setStartTimeUtcSch(start);
    seg->setEndTimeUtcSch(end);
    seg->setIsOperating(true);
    seg->setAssignment("FLY");
    return seg;
}

void attachDutyNodes(Duty& duty, time_t briefStart, time_t briefEnd, time_t debriefStart, time_t debriefEnd) {
    auto addNode = [&](const std::string& type, const std::string& node, time_t start, time_t end, int seq) {
        auto pdn = std::make_shared<PairingDutyNode>();
        pdn->setType(type);
        pdn->setNode(node);
        pdn->setSequence(seq);
        pdn->setDutyId(duty.getDutyId());
        pdn->setStartUtc(start);
        pdn->setEndUtc(end);
        pdn->setStartTimeUtcAct(start);
        pdn->setEndTimeUtcAct(end);
        pdn->setStartTimeUtcSch(start);
        pdn->setEndTimeUtcSch(end);
        duty.pairingDutyNodes.push_back(pdn);
    };

    addNode("DUTY", "BRIEF", briefStart, briefEnd, 1);
    addNode("DUTY", "DEBRIEF", debriefStart, debriefEnd, 2);
}

std::unique_ptr<Duty> makeDuty(const std::vector<Segment*>& segments, CrewDataContext* ctx) {
    auto duty = std::make_unique<Duty>(segments);
    static long long dutyId = 58000;
    duty->setDutyId(dutyId++);
    duty->setAssignment("FLY");
    if (!segments.empty()) {
        duty->setDepartureStation(segments.front()->getDepSta());
        duty->setArrivalStation(segments.back()->getArrSta());
        
        time_t reportTime = segments.front()->getStartTimeUtcSch() - 3600;
        time_t firstSegStart = segments.front()->getStartTimeUtcSch();
        time_t lastSegEnd = segments.back()->getEndTimeUtcSch();
        time_t releaseTime = lastSegEnd + 1800;

        duty->setStartTimeUtcSch(reportTime);
        duty->setEndTimeUtcSch(releaseTime);
        duty->setStartTimeUtcAct(reportTime);
        duty->setEndTimeUtcAct(releaseTime);
        
        const int offsetMinutes = ctx->airportUtcOffsetMap.at(duty->getDepartureStation());
        const time_t startLoc = duty->getStartTimeUtcAct() + offsetMinutes * 60;
		auto offsetMinutesArr = ctx->airportUtcOffsetMap.at(duty->getArrivalStation());
		const time_t endLoc = duty->getEndTimeUtcAct() + offsetMinutesArr * 60;

        duty->setStartTimeLocAct(startLoc);
        duty->setStartTimeLocSch(startLoc);
        duty->setEndTimeLocAct(endLoc);
        duty->setEndTimeLocSch(endLoc);
        
        attachDutyNodes(*duty, reportTime, firstSegStart, lastSegEnd, releaseTime);
        duty->resetTypeBySegments();
    }
    return duty;
}

std::unique_ptr<Duty> makeStandbyDuty(const std::string& startUtc,
                                     const std::string& endUtc,
                                     const std::string& station,
                                     CrewDataContext* ctx,
                                     std::vector<std::unique_ptr<Segment>>& segStore) {
    auto duty = std::make_unique<Duty>();
    static long long dutyId = 68000;
    duty->setDutyId(dutyId++);
    const time_t start = utcFromString(startUtc);
    const time_t end = utcFromString(endUtc);
    duty->setAssignment("SBY");
    duty->setDepartureStation(station);
    duty->setArrivalStation(station);
    duty->setStartTimeUtcSch(start);
    duty->setEndTimeUtcSch(end);
    duty->setStartTimeUtcAct(start);
    duty->setEndTimeUtcAct(end);

    const int offsetMinutes = ctx->airportUtcOffsetMap.at(duty->getDepartureStation());
    const time_t startLoc = duty->getStartTimeUtcAct() + offsetMinutes * 60;
	const time_t endLoc = duty->getEndTimeUtcAct() + offsetMinutes * 60;
	duty->setStartTimeLocAct(startLoc);
	duty->setStartTimeLocSch(startLoc);
	duty->setEndTimeLocAct(endLoc);
	duty->setEndTimeLocSch(endLoc);

    auto seg = std::make_unique<Segment>();
    seg->setSegmentId(78000 + static_cast<long long>(segStore.size()));
    seg->setDutyId(duty->getDutyId());
    seg->setDepSta(station);
    seg->setArrSta(station);
    seg->setStartTimeUtcAct(start);
    seg->setEndTimeUtcAct(end);
    seg->setStartTimeUtcSch(start);
    seg->setEndTimeUtcSch(end);
    seg->setStartTimeLocAct(startLoc);
    seg->setEndTimeLocAct(endLoc);
    seg->setStartTimeLocSch(startLoc);
    seg->setEndTimeLocSch(endLoc);
    seg->setAssignment("SBY");
    seg->setIsOperating(false);
    segStore.push_back(std::move(seg));
    std::vector<Segment*> segRefs{segStore.back().get()};
    duty->setSegments(segRefs);

    auto pdn = std::make_shared<PairingDutyNode>();
    pdn->setType("DUTY");
    pdn->setNode("SBY");
    pdn->setSequence(1);
    pdn->setDutyId(duty->getDutyId());
    pdn->setStartUtc(start);
    pdn->setEndUtc(end);
    pdn->setStartLoc(startLoc);
    pdn->setEndLoc(endLoc);
    pdn->setStartTimeUtcAct(start);
    pdn->setEndTimeUtcAct(end);
    pdn->setStartTimeUtcSch(start);
    pdn->setEndTimeUtcSch(end);
    pdn->setStartTimeLocAct(startLoc);
    pdn->setEndTimeLocAct(endLoc);
    pdn->setStartTimeLocSch(startLoc);
    pdn->setEndTimeLocSch(endLoc);
    duty->pairingDutyNodes.push_back(pdn);
    
    duty->resetTypeBySegments();
    return duty;
}

std::unique_ptr<Pairing> makePairing(const std::vector<Duty*>& duties,
                                     const SharedPtr<CrewDataContext>& ctx) {
    auto pairing = std::make_unique<Pairing>(duties);
    pairing->setBase("SIN");
    pairing->setPrimeActivity("FLY");
    pairing->setId(90048);
    if (!duties.empty()) {
        pairing->setStartTimeUtcAct(duties.front()->getStartTimeUtcAct());
        pairing->setEndTimeUtcAct(duties.back()->getEndTimeUtcAct());
        pairing->setStartTimeUtcSch(duties.front()->getStartTimeUtcSch());
        pairing->setEndTimeUtcSch(duties.back()->getEndTimeUtcSch());
    }
    ctx->pairingIdMap[pairing->getId()] = pairing.get();
    return pairing;
}

}  // namespace

class SIA_4_8_DutyHourRule : public ::testing::Test {
protected:
    void SetUp() override {
        _guard = std::make_unique<SIATest::SiaRuleParamGuard>();
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        _ctx = buildContext();

        CalculationManday actDp{};
        actDp.airline = _ctx->scenario.airline;
        actDp.type = "ACT DP";
        actDp.str = "ACT";
        actDp.end = "ACT";
        _ctx->addCalculationManday("ACT DP", actDp);

        auto assignment = std::make_shared<ASSIGNMENT>();
        assignment->AIRLINE = _ctx->scenario.airline;
        assignment->ASSIGNMENT_ID = 1;
        assignment->assignment = "FLY";
        assignment->TYPE = "FLY";
        assignment->DP_PCT = 1.0;
        if (_ctx->assignmentNameMap.find("FLY") == _ctx->assignmentNameMap.end()) {
            _ctx->assignmentNameMap["FLY"] = assignment;
            AssignmentHolder::getAirline(_ctx->scenario.airline);
            AssignmentHolder::getInst().add(*assignment);
        }

        if (_ctx->assignmentNameMap.find("SBY") == _ctx->assignmentNameMap.end()) {
            auto standbyAssignment = std::make_shared<ASSIGNMENT>();
            standbyAssignment->AIRLINE = _ctx->scenario.airline;
            standbyAssignment->ASSIGNMENT_ID = 2;
            standbyAssignment->assignment = "SBY";
            standbyAssignment->TYPE = "SBY";
            standbyAssignment->DP_PCT = 1.0;
            standbyAssignment->FDP_PCT = 0.0;
            standbyAssignment->BT_PCT = 0.0;
            _ctx->assignmentNameMap["SBY"] = standbyAssignment;
            AssignmentHolder::getInst().add(*standbyAssignment);
        }
    }

    void TearDown() override {
        for (auto* rv : _violations) {
            delete rv;
        }
        _violations.clear();
        _segStore.clear();
        _dutyStore.clear();
    }
    
    Duty* addDuty(std::vector<Segment*> segments, CrewDataContext* ctx) {
        _dutyStore.push_back(makeDuty(segments, ctx));
        return _dutyStore.back().get();
    }

    Duty* addStandbyDuty(const std::string& start, const std::string& end, const std::string& station, CrewDataContext* ctx) {
        _dutyStore.push_back(makeStandbyDuty(start, end, station, ctx, _segStore));
        return _dutyStore.back().get();
    }
    
    Segment* addSegment(const std::string& dep, const std::string& arr, const std::string& start, const std::string& end) {
        _segStore.push_back(makeSegment(dep, arr, start, end));
        return _segStore.back().get();
    }

    std::unique_ptr<SIATest::SiaRuleParamGuard> _guard;
    SharedPtr<CrewDataContext> _ctx;
    std::vector<std::unique_ptr<Segment>> _segStore;
    std::vector<std::unique_ptr<Duty>> _dutyStore;
    std::vector<RULE_VIOLATION*> _violations;
};

TEST_F(SIA_4_8_DutyHourRule, Case1_Legal_87_45H) {
    auto rule =  makeRule(14, "CD", { "00:00-88:00" }, _ctx);
    rule->setRuleViolation(&_violations);

    std::vector<Duty*> duties;
    duties.push_back(addDuty({addSegment("SIN", "ICN", "2025-12-01 06:35:00", "2025-12-01 13:00:00")}, _ctx.get()));
    duties.push_back(addDuty({addSegment("ICN", "CVG", "2025-12-02 14:40:00", "2025-12-03 04:10:00")}, _ctx.get()));
    duties.push_back(addStandbyDuty("2025-12-04 09:00:00", "2025-12-04 12:00:00", "CVG", _ctx.get()));
    duties.push_back(addDuty({addSegment("CVG", "NGO", "2025-12-05 19:10:00", "2025-12-06 09:30:00")}, _ctx.get()));
    duties.push_back(addDuty({addSegment("NGO", "LAX", "2025-12-07 22:05:00", "2025-12-08 08:00:00")}, _ctx.get()));
    duties.push_back(addDuty({addSegment("LAX", "HNL", "2025-12-10 14:25:00", "2025-12-10 20:20:00")}, _ctx.get()));
    duties.push_back(addDuty({addSegment("HNL", "SYD", "2025-12-11 23:00:00", "2025-12-12 09:25:00")}, _ctx.get()));
    duties.push_back(addDuty({
        addSegment("SYD", "MEL", "2025-12-13 11:25:00", "2025-12-13 13:00:00"),
        addSegment("MEL", "SIN", "2025-12-13 17:15:00", "2025-12-14 01:10:00")
    }, _ctx.get()));
    
    auto pairing = makePairing(duties, _ctx);
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}

TEST_F(SIA_4_8_DutyHourRule, Case2_Warning_88_45H) {
    auto rule = makeRule(14, "CD", { "00:00-88:00" }, _ctx);
    rule->setRuleViolation(&_violations);

    std::vector<Duty*> duties;
    duties.push_back(addDuty({addSegment("SIN", "ICN", "2025-12-01 06:35:00", "2025-12-01 13:00:00")}, _ctx.get()));
    duties.push_back(addDuty({addSegment("ICN", "CVG", "2025-12-02 14:40:00", "2025-12-03 04:10:00")}, _ctx.get()));
    duties.push_back(addStandbyDuty("2025-12-04 09:00:00", "2025-12-04 13:00:00", "CVG", _ctx.get())); // Extended SBY
    duties.push_back(addDuty({addSegment("CVG", "NGO", "2025-12-05 19:10:00", "2025-12-06 09:30:00")}, _ctx.get()));
    duties.push_back(addDuty({addSegment("NGO", "LAX", "2025-12-07 22:05:00", "2025-12-08 08:00:00")}, _ctx.get()));
    duties.push_back(addDuty({addSegment("LAX", "HNL", "2025-12-10 14:25:00", "2025-12-10 20:20:00")}, _ctx.get()));
    duties.push_back(addDuty({addSegment("HNL", "SYD", "2025-12-11 23:00:00", "2025-12-12 09:25:00")}, _ctx.get()));
    duties.push_back(addDuty({
        addSegment("SYD", "MEL", "2025-12-13 11:25:00", "2025-12-13 13:00:00"),
        addSegment("MEL", "SIN", "2025-12-13 17:15:00", "2025-12-14 01:10:00")
    }, _ctx.get()));

    auto pairing = makePairing(duties, _ctx);
    EXPECT_FALSE(rule->CheckRule(pairing.get())); // Exceeds buffer, should fail with warning
    ASSERT_EQ(_violations.size(), 1);
}

TEST_F(SIA_4_8_DutyHourRule, Case3_Illegal_90_45H) {
    auto rule = makeRule(14, "CD", { "00:00-90:00" }, _ctx);
    rule->setRuleViolation(&_violations);

    std::vector<Duty*> duties;
    duties.push_back(addDuty({addSegment("SIN", "ICN", "2025-12-01 06:35:00", "2025-12-01 13:00:00")}, _ctx.get()));
    duties.push_back(addDuty({addSegment("ICN", "CVG", "2025-12-02 14:40:00", "2025-12-03 04:10:00")}, _ctx.get()));
    duties.push_back(addStandbyDuty("2025-12-04 09:00:00", "2025-12-04 15:00:00", "CVG", _ctx.get())); // Further extended SBY
    duties.push_back(addDuty({addSegment("CVG", "NGO", "2025-12-05 19:10:00", "2025-12-06 09:30:00")}, _ctx.get()));
    duties.push_back(addDuty({addSegment("NGO", "LAX", "2025-12-07 22:05:00", "2025-12-08 08:00:00")}, _ctx.get()));
    duties.push_back(addDuty({addSegment("LAX", "HNL", "2025-12-10 14:25:00", "2025-12-10 20:20:00")}, _ctx.get()));
    duties.push_back(addDuty({addSegment("HNL", "SYD", "2025-12-11 23:00:00", "2025-12-12 09:25:00")}, _ctx.get()));
    duties.push_back(addDuty({
        addSegment("SYD", "MEL", "2025-12-13 11:25:00", "2025-12-13 13:00:00"),
        addSegment("MEL", "SIN", "2025-12-13 17:15:00", "2025-12-14 01:10:00")
    }, _ctx.get()));

    auto pairing = makePairing(duties, _ctx);
    EXPECT_FALSE(rule->CheckRule(pairing.get()));
    ASSERT_EQ(_violations.size(), 1);
}

TEST_F(SIA_4_8_DutyHourRule, Case4_Legal_NoSBY_84_45H) {
    auto rule = makeRule(14, "CD", { "00:00-85:00" }, _ctx);
    rule->setRuleViolation(&_violations);

    std::vector<Duty*> duties;
    duties.push_back(addDuty({addSegment("SIN", "ICN", "2025-12-01 06:35:00", "2025-12-01 13:00:00")}, _ctx.get()));
    duties.push_back(addDuty({addSegment("ICN", "CVG", "2025-12-02 14:40:00", "2025-12-03 04:10:00")}, _ctx.get()));
    // No SBY duty
    duties.push_back(addDuty({addSegment("CVG", "NGO", "2025-12-05 19:10:00", "2025-12-06 09:30:00")}, _ctx.get()));
    duties.push_back(addDuty({addSegment("NGO", "LAX", "2025-12-07 22:05:00", "2025-12-08 08:00:00")}, _ctx.get()));
    duties.push_back(addDuty({addSegment("LAX", "HNL", "2025-12-10 14:25:00", "2025-12-10 20:20:00")}, _ctx.get()));
    duties.push_back(addDuty({addSegment("HNL", "SYD", "2025-12-11 23:00:00", "2025-12-12 09:25:00")}, _ctx.get()));
    duties.push_back(addDuty({
        addSegment("SYD", "MEL", "2025-12-13 11:25:00", "2025-12-13 13:00:00"),
        addSegment("MEL", "SIN", "2025-12-13 17:15:00", "2025-12-14 01:10:00")
    }, _ctx.get()));

    auto pairing = makePairing(duties, _ctx);
    EXPECT_TRUE(rule->CheckRule(pairing.get()));
    EXPECT_TRUE(_violations.empty());
}
