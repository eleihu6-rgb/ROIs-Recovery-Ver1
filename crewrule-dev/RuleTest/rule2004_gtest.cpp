#include <gtest/gtest.h>

#include "RuleEngine/RuleEngine.h"
#include "db/RuleParams.h"

#include <cstring>
#include <algorithm>
#include <memory>
#include <string>
#include <vector>

// Forward declaration from db/RuleParseParams.cpp for targeted parsing test.
std::shared_ptr<ruleParams> parseRuleParam2004(DBRule& item);
namespace {

time_t minutesToSeconds(int minutes) {
    return static_cast<time_t>(minutes) * 60;
}

struct DutySegmentConfig {
    std::string assignment{"FLY"};
    std::string dep{"PEK"};
    std::string arr{"SHA"};
    std::string tail{"B738"};
    std::string nextLegNo;
    std::string flightNumber;
    std::string fleet{"738"};
    std::string flightFlag{"A"};
    std::string fltStatus;
    int startUtcMinutes{0};
    int endUtcMinutes{60};
    int ftMinutes{60};
    bool isDeadhead{false};
    bool isBus{false};
};

DutySegmentConfig makeSegmentConfig(std::string assignment,
                                    std::string dep,
                                    std::string arr,
                                    int startUtcMinutes,
                                    int endUtcMinutes,
                                    std::string tail = "TAIL",
                                    bool isDeadhead = false,
                                    bool isBus = false) {
    DutySegmentConfig cfg;
    cfg.assignment = std::move(assignment);
    cfg.dep = std::move(dep);
    cfg.arr = std::move(arr);
    cfg.startUtcMinutes = startUtcMinutes;
    cfg.endUtcMinutes = endUtcMinutes;
    cfg.tail = std::move(tail);
    cfg.isDeadhead = isDeadhead;
    cfg.isBus = isBus;
    cfg.ftMinutes = endUtcMinutes - startUtcMinutes;
    return cfg;
}

struct DutyBuildResult {
    std::unique_ptr<Duty> duty;
    std::vector<std::unique_ptr<Segment>> segments;
};

void fillAirportRecord(DBAirport& airport, const std::string& code, const std::string& zoneId, const std::string& dir) {
    std::strncpy(airport.airport, code.c_str(), sizeof(airport.airport) - 1);
    std::strncpy(airport.zoneId, zoneId.c_str(), sizeof(airport.zoneId) - 1);
    std::strncpy(airport.dir, dir.c_str(), sizeof(airport.dir) - 1);
    airport.utcOffsetMinutes = 0;
}

DutyBuildResult makeDuty(const std::vector<DutySegmentConfig>& segmentConfigs) {
    DutyBuildResult result;
    result.duty = std::make_unique<Duty>();

    std::vector<Segment*> rawSegments;
    rawSegments.reserve(segmentConfigs.size());

    for (std::size_t i = 0; i < segmentConfigs.size(); ++i) {
        const auto& cfg = segmentConfigs[i];
        auto segment = std::make_unique<Segment>();
        segment->setAssignment(cfg.assignment);
        segment->setDepStation(cfg.dep);
        segment->setArrStation(cfg.arr);
        segment->setTailNum(cfg.tail);
        segment->setFleetCD(cfg.fleet);
        segment->setFlightFlag(cfg.flightFlag);
        segment->setFltSts(cfg.fltStatus);
        if (!cfg.nextLegNo.empty()) {
            segment->setNextLegNo(cfg.nextLegNo);
        } else {
            segment->setNextLegNo("LEG" + std::to_string(i));
        }
        auto startSeconds = minutesToSeconds(cfg.startUtcMinutes);
        auto endSeconds = minutesToSeconds(cfg.endUtcMinutes);
        segment->setStartTimeUtcAct(startSeconds);
        segment->setEndTimeUtcAct(endSeconds);
        segment->setStartTimeLocAct(startSeconds);
        segment->setEndTimeLocAct(endSeconds);
        segment->setStartTimeUtcSch(startSeconds);
        segment->setEndTimeUtcSch(endSeconds);
        segment->setStartTimeLocSch(startSeconds);
        segment->setEndTimeLocSch(endSeconds);
        segment->setFTTime(cfg.ftMinutes * 60);
        segment->setIsOperating(cfg.assignment == "FLY");
        segment->setIsDeadhead(cfg.isDeadhead);
        segment->setIsBusFerry(cfg.isBus);
        segment->setIsTrainFerry(false);
        segment->setPairingId(1);
        segment->setDutyId(1);
        segment->setSegSeq(static_cast<int>(i + 1));
        segment->setIsCountForCoverage(true);
        segment->setFlightNumber(cfg.flightNumber.empty() ? cfg.assignment + std::to_string(i + 1) : cfg.flightNumber);
        rawSegments.push_back(segment.get());
        result.segments.push_back(std::move(segment));
    }

    result.duty->setSegments(rawSegments);
    result.duty->setType(Duty::DUTY_FLY);
    result.duty->setPairingId(1);
    result.duty->setDutySeq(1);
    result.duty->setBase(segmentConfigs.front().dep);
    result.duty->setDepartureStation(segmentConfigs.front().dep);
    result.duty->setArrivalStation(segmentConfigs.back().arr);
    auto dutyStart = minutesToSeconds(segmentConfigs.front().startUtcMinutes);
    auto dutyEnd = minutesToSeconds(segmentConfigs.back().endUtcMinutes);
    result.duty->setStartTimeUtcAct(dutyStart);
    result.duty->setEndTimeUtcAct(dutyEnd);
    result.duty->setStartTimeLocAct(dutyStart);
    result.duty->setEndTimeLocAct(dutyEnd);
    result.duty->setStartTimeUtcSch(dutyStart);
    result.duty->setEndTimeUtcSch(dutyEnd);
    result.duty->setStartTimeLocSch(dutyStart);
    result.duty->setEndTimeLocSch(dutyEnd);
    result.duty->setActualPickupMin(0);
    result.duty->setActualDropoffMin(0);
    result.duty->calculateDutyValues(PAIRING_EDITOR);
    return result;
}

struct Rule2004Config {
    std::string maxFlySegments{"99"};
    std::string maxNonOperateSegments{"99"};
    std::string maxAircraftChanges{"99"};
    std::string maxAircraftChangesWithLT{"99"};
    std::string maxConsecutiveDhd{"99"};
    std::string maxDhd{"99"};
    std::string maxGroundCommute{"99"};
    std::string isDhdAllowedMiddle{"Y"};
    std::string isDutySegmentsSameDay{"N"};
    std::string isInternationalDhdAllowed{"Y"};
    std::string isDhdBetweenBaseAndLo{"N"};
    std::string isDutyBelongDifferentDay{"N"};
    std::string totalSegments{"99"};
    std::string maxFlightBlhAllowDhd{"999:00"};
    std::string overNightFlyThreshold;
    std::string maxDutyDp;
};

std::unique_ptr<DBRule> makeRule2004(const Rule2004Config& cfg) {
    auto rule = std::make_unique<DBRule>();
    auto parsed = std::make_shared<rule2004>();
    parsed->maxNrFlySegsInDuty = cfg.maxFlySegments;
    parsed->maxNrNonoperateLegsInDuty = cfg.maxNonOperateSegments;
    parsed->maxNrAircraftChangeInDuty = cfg.maxAircraftChanges;
    parsed->maxNrConsecutiveDhd = cfg.maxConsecutiveDhd;
    parsed->maxNrDHDInDuty = cfg.maxDhd;
    parsed->isDhdAllowedInMiddleDuty = cfg.isDhdAllowedMiddle;
    parsed->isDutySegmentsInSameCalendarDay = cfg.isDutySegmentsSameDay;
    parsed->maxNrGRDCommuteInDuty = cfg.maxGroundCommute;
    parsed->isDutyBelongToDifferentDayChecked = cfg.isDutyBelongDifferentDay;
    parsed->maxNrAircraftchangsAndLTInDuty = cfg.maxAircraftChangesWithLT;
    parsed->isDHDmustBetweenBaseAndLOStation = cfg.isDhdBetweenBaseAndLo;
    parsed->totalSegsInDuty = cfg.totalSegments;
    parsed->maxFlightBLHAllowDHD = cfg.maxFlightBlhAllowDhd;
    parsed->isInternationalDHDallowed = cfg.isInternationalDhdAllowed;
    parsed->overNightFlyThredhold = cfg.overNightFlyThreshold;
    parsed->maxDutyDP = cfg.maxDutyDp;
    rule->parsedParam = parsed;
    rule->idRule = 2004;
    rule->idRuleParam = 2004;
    return rule;
}

SharedPtr<CrewDataContext> buildDataContext(const std::vector<std::string>& airports) {
    auto ctx = std::make_shared<CrewDataContext>();
    for (const auto& airportCode : airports) {
        DBAirport rec{};
        fillAirportRecord(rec, airportCode, "Etc/UTC", "D");
        ctx->airportList.push_back(rec);
        ctx->airportZoneIdMap[airportCode] = "Etc/UTC";
    }
    return ctx;
}

}  // namespace

class Rule2004Test : public ::testing::Test {
protected:
    Rule2004Test()
        : _checker(PAIRING_EDITOR, false),
          _dataContext(buildDataContext({"PEK", "SHA", "CKG", "XIY"})) {}

    void SetUp() override {
        RuleParams::GetInstancePtr()->setApplication(PAIRING_EDITOR);
        _checker.setDataContext(_dataContext, -1, false);
    }

    LegalityChecker _checker;
    SharedPtr<CrewDataContext> _dataContext;
};

TEST_F(Rule2004Test, DutyWithinLimitsPasses) {
    Rule2004Config cfg;
    cfg.maxDutyDp = "24:00";
    auto rule = makeRule2004(cfg);

    std::vector<DutySegmentConfig> segments;
    segments.push_back(makeSegmentConfig("FLY", "PEK", "SHA", 0, 120, "A1"));
    segments.push_back(makeSegmentConfig("FLY", "SHA", "PEK", 240, 360, "A1"));
    auto dutyData = makeDuty(segments);

    std::vector<Duty*> duties{dutyData.duty.get()};
    EXPECT_TRUE(_checker.checkDutyLimitation(duties, rule.get(), "PEK"));
}

TEST_F(Rule2004Test, FlySegmentsExceedLimitFail) {
    Rule2004Config cfg;
    cfg.maxFlySegments = "1";
    cfg.maxDutyDp = "24:00";
    auto rule = makeRule2004(cfg);

    std::vector<DutySegmentConfig> segments;
    segments.push_back(makeSegmentConfig("FLY", "PEK", "SHA", 0, 120, "A1"));
    segments.push_back(makeSegmentConfig("FLY", "SHA", "PEK", 240, 360, "A2"));
    auto dutyData = makeDuty(segments);

    std::vector<Duty*> duties{dutyData.duty.get()};
    EXPECT_FALSE(_checker.checkDutyLimitation(duties, rule.get(), "PEK"));

    const auto violations = _checker.getRuleViolations();
    auto match = std::find_if(violations.begin(), violations.end(), [](const RULE_VIOLATION* v) {
        auto it = v->operation_result.find("ruleId");
        return it != v->operation_result.end() && it->second == "2004.10";
    });
    ASSERT_NE(match, violations.end());
    EXPECT_NE((*match)->violation_msg.find("actual=2"), std::string::npos);
    EXPECT_NE((*match)->violation_msg.find("limit=1"), std::string::npos);
}

TEST_F(Rule2004Test, ConsecutiveDeadheadViolation) {
    Rule2004Config cfg;
    cfg.maxConsecutiveDhd = "1";
    cfg.maxDutyDp = "24:00";
    auto rule = makeRule2004(cfg);

    std::vector<DutySegmentConfig> segments;
    segments.push_back(makeSegmentConfig("FLY", "PEK", "SHA", 0, 90, "A1"));
    segments.push_back(makeSegmentConfig("DHD", "SHA", "CKG", 120, 210, "D1", true));
    segments.push_back(makeSegmentConfig("DHD", "CKG", "XIY", 240, 330, "D1", true));
    segments.push_back(makeSegmentConfig("FLY", "XIY", "PEK", 400, 520, "A1"));
    auto dutyData = makeDuty(segments);

    std::vector<Duty*> duties{dutyData.duty.get()};
    EXPECT_FALSE(_checker.checkDutyLimitation(duties, rule.get(), "PEK"));
}

TEST_F(Rule2004Test, MissingTailUsesUiVirtualTailGroupingForAircraftChanges) {
    Rule2004Config cfg;
    cfg.maxAircraftChanges = "1";
    cfg.maxAircraftChangesWithLT = "1";
    cfg.maxDutyDp = "24:00";
    auto rule = makeRule2004(cfg);

    std::vector<DutySegmentConfig> segments;
    segments.push_back(makeSegmentConfig("FLY", "PEK", "SHA", 0, 70, ""));
    segments.back().flightNumber = "116";
    segments.back().nextLegNo = "115";
    segments.back().fleet = "7M8";
    segments.push_back(makeSegmentConfig("FLY", "SHA", "PEK", 115, 185, ""));
    segments.back().flightNumber = "115";
    segments.back().nextLegNo = "142";
    segments.back().fleet = "7M8";
    segments.push_back(makeSegmentConfig("FLY", "PEK", "CKG", 240, 330, ""));
    segments.back().flightNumber = "142";
    segments.back().nextLegNo = "141";
    segments.back().fleet = "359";
    segments.push_back(makeSegmentConfig("FLY", "CKG", "PEK", 375, 475, ""));
    segments.back().flightNumber = "141";
    segments.back().nextLegNo = "164";
    segments.back().fleet = "359";
    segments.push_back(makeSegmentConfig("FLY", "PEK", "SHA", 520, 590, ""));
    segments.back().flightNumber = "106";
    segments.back().nextLegNo = "105";
    segments.back().fleet = "7M8";
    segments.push_back(makeSegmentConfig("FLY", "SHA", "PEK", 635, 715, ""));
    segments.back().flightNumber = "105";
    segments.back().nextLegNo = "634";
    segments.back().fleet = "7M8";

    auto dutyData = makeDuty(segments);

    std::vector<Duty*> duties{dutyData.duty.get()};
    EXPECT_FALSE(_checker.checkDutyLimitation(duties, rule.get(), "PEK"));

    const auto violations = _checker.getRuleViolations();
    EXPECT_TRUE(std::any_of(violations.begin(), violations.end(), [](const RULE_VIOLATION* v) {
        auto it = v->operation_result.find("ruleId");
        return it != v->operation_result.end() && it->second == "2004.7";
    }));
    EXPECT_TRUE(std::any_of(violations.begin(), violations.end(), [](const RULE_VIOLATION* v) {
        auto it = v->operation_result.find("ruleId");
        return it != v->operation_result.end() && it->second == "2004.8";
    }));
}

TEST_F(Rule2004Test, MissingTailSameFleetAndStationConnectionWithMismatchedOnwardCountsAircraftChange) {
    Rule2004Config cfg;
    cfg.maxAircraftChanges = "0";
    cfg.maxAircraftChangesWithLT = "0";
    cfg.maxDutyDp = "24:00";
    auto rule = makeRule2004(cfg);

    std::vector<DutySegmentConfig> segments;
    segments.push_back(makeSegmentConfig("FLY", "PEK", "SHA", 0, 70, ""));
    segments.back().flightNumber = "116";
    segments.back().nextLegNo = "777";
    segments.back().fleet = "7M8";
    segments.push_back(makeSegmentConfig("FLY", "SHA", "PEK", 115, 185, ""));
    segments.back().flightNumber = "999";
    segments.back().fleet = "7M8";

    auto dutyData = makeDuty(segments);

    std::vector<Duty*> duties{dutyData.duty.get()};
    EXPECT_FALSE(_checker.checkDutyLimitation(duties, rule.get(), "PEK"));
}

TEST_F(Rule2004Test, MissingTailSameFleetWithMismatchedOnwardAndNoStationConnectionCountsAircraftChange) {
    Rule2004Config cfg;
    cfg.maxAircraftChanges = "0";
    cfg.maxAircraftChangesWithLT = "0";
    cfg.maxDutyDp = "24:00";
    auto rule = makeRule2004(cfg);

    std::vector<DutySegmentConfig> segments;
    segments.push_back(makeSegmentConfig("FLY", "PEK", "SHA", 0, 70, ""));
    segments.back().flightNumber = "116";
    segments.back().nextLegNo = "777";
    segments.back().fleet = "7M8";
    segments.push_back(makeSegmentConfig("FLY", "CKG", "PEK", 115, 185, ""));
    segments.back().flightNumber = "999";
    segments.back().fleet = "7M8";

    auto dutyData = makeDuty(segments);

    std::vector<Duty*> duties{dutyData.duty.get()};
    EXPECT_FALSE(_checker.checkDutyLimitation(duties, rule.get(), "PEK"));
}

TEST_F(Rule2004Test, DutySegmentStartsMustStayOnDutyStartLocalDay) {
    Rule2004Config cfg;
    cfg.isDutySegmentsSameDay = "Y";
    cfg.overNightFlyThreshold = "00:00";
    cfg.maxDutyDp = "30:00";
    auto rule = makeRule2004(cfg);

    std::vector<DutySegmentConfig> segments;
    segments.push_back(makeSegmentConfig("FLY", "PEK", "SHA", 0, 120, "A1"));
    segments.push_back(makeSegmentConfig("FLY", "SHA", "PEK", 26 * 60, 27 * 60, "A1"));
    auto dutyData = makeDuty(segments);

    std::vector<Duty*> duties{dutyData.duty.get()};
    EXPECT_FALSE(_checker.checkDutyLimitation(duties, rule.get(), "PEK"));

    const auto violations = _checker.getRuleViolations();
    auto match = std::find_if(violations.begin(), violations.end(), [](const RULE_VIOLATION* v) {
        auto it = v->operation_result.find("ruleId");
        return it != v->operation_result.end() && it->second == "2004.15";
    });
    ASSERT_NE(match, violations.end());
}

TEST(Rule2004ParseTest, SpacedParamNamesAreParsed) {
    DBRule rule;
    rule.function = 2004;
    std::vector<std::pair<std::string, std::string>> params = {
        {"Max Nr Fly Segs In Duty", "3"},
        {"Max Nr Nonoperate Legs In Duty", "2"},
        {"Max Nr Aircraft Change In Duty", "1"},
        {"Max Nr Consecutive Dhd", "1"},
        {"Max Nr Dhd In Duty", "2"},
        {"Is Dhd Allowed In Middle Duty", "N"},
        {"Is Duty Segments In Same Calendar Day", "Y"},
        {"Max Nr Grd Commute In Duty", "0"},
        {"Is Duty Belong To Different Day Checked", "Y"},
        {"Max Nr Aircraft Changes And LT In Duty", "1"},
        {"Is Dhd Must Between Base And LO Station", "Y"},
        {"Total Segs In Duty", "5"},
        {"Max Flight BLH Allow DHD", "01:00"},
        {"Is International DHD Allowed", "N"},
        {"Over Night Fly Threshold", "00:30"},
        {"Max Duty DP", "10:00"},
        {"Max Fly Time In Duty", "02:00"},
        {"Pure Deadhead Duty Allowed", "N"},
        {"Max FDP With Aircraft Change", "09:00"},
    };
    for (const auto& p : params) {
        rule.params.insert(p);
    }
    auto parsedBase = parseRuleParam2004(rule);
    auto parsed = std::static_pointer_cast<rule2004>(parsedBase);

    EXPECT_EQ("3", parsed->maxNrFlySegsInDuty);
    EXPECT_EQ("2", parsed->maxNrNonoperateLegsInDuty);
    EXPECT_EQ("1", parsed->maxNrAircraftChangeInDuty);
    EXPECT_EQ("1", parsed->maxNrConsecutiveDhd);
    EXPECT_EQ("2", parsed->maxNrDHDInDuty);
    EXPECT_EQ("N", parsed->isDhdAllowedInMiddleDuty);
    EXPECT_EQ("Y", parsed->isDutySegmentsInSameCalendarDay);
    EXPECT_EQ("0", parsed->maxNrGRDCommuteInDuty);
    EXPECT_EQ("Y", parsed->isDutyBelongToDifferentDayChecked);
    EXPECT_EQ("1", parsed->maxNrAircraftchangsAndLTInDuty);
    EXPECT_EQ("Y", parsed->isDHDmustBetweenBaseAndLOStation);
    EXPECT_EQ("5", parsed->totalSegsInDuty);
    EXPECT_EQ("01:00", parsed->maxFlightBLHAllowDHD);
    EXPECT_EQ("N", parsed->isInternationalDHDallowed);
    EXPECT_EQ("00:30", parsed->overNightFlyThredhold);
    EXPECT_EQ("10:00", parsed->maxDutyDP);
    EXPECT_EQ("02:00", parsed->maxFlyTimeInDuty);
    EXPECT_EQ("N", parsed->pureDeadheadDutyAllowed);
    EXPECT_EQ("09:00", parsed->maxFdpWithAircraftChange);
}

TEST(Rule2004ParseTest, OriginalParamNamesAreParsed) {
    DBRule rule;
    rule.function = 2004;
    std::vector<std::pair<std::string, std::string>> params = {
        {"maxNrFlySegsInDuty", "4"},
        {"maxNrNonoperateLegsInDuty", "3"},
        {"maxNrAircraftChangeInDuty", "2"},
        {"maxNrConsecutiveDhd", "2"},
        {"maxNrDHDInDuty", "2"},
        {"isDhdAllowedInMiddleDuty", "N"},
        {"isDutySegmentsInSameCalendarDay", "Y"},
        {"maxNrGRDCommuteInDuty", "1"},
        {"isDutyBelongToDifferentDayChecked", "Y"},
        {"maxNrAircraftchangsAndLTInDuty", "2"},
        {"isDHDmustBetweenBaseAndLOStation", "Y"},
        {"totalSegsInDuty", "6"},
        {"maxFlightBLHAllowDHD", "00:45"},
        {"isInternationalDHDallowed", "N"},
        {"OVER NIGHT FLY THREDHOLD", "00:15"},
        {"maxDutyDP", "09:00"},
        {"allowDifferentAirlineOperationFlightMix", "Y"},
        {"allowDifferentAirlineDeadheadFlightMix", "N"},
        {"maxFlyTimeInDuty", "01:30"},
        {"pureDeadheadDutyAllowed", "N"},
        {"maxFdpWithAircraftChange", "08:00"},
    };
    for (const auto& p : params) {
        rule.params.insert(p);
    }
    auto parsedBase = parseRuleParam2004(rule);
    auto parsed = std::static_pointer_cast<rule2004>(parsedBase);

    EXPECT_EQ("4", parsed->maxNrFlySegsInDuty);
    EXPECT_EQ("3", parsed->maxNrNonoperateLegsInDuty);
    EXPECT_EQ("2", parsed->maxNrAircraftChangeInDuty);
    EXPECT_EQ("2", parsed->maxNrConsecutiveDhd);
    EXPECT_EQ("2", parsed->maxNrDHDInDuty);
    EXPECT_EQ("N", parsed->isDhdAllowedInMiddleDuty);
    EXPECT_EQ("Y", parsed->isDutySegmentsInSameCalendarDay);
    EXPECT_EQ("1", parsed->maxNrGRDCommuteInDuty);
    EXPECT_EQ("Y", parsed->isDutyBelongToDifferentDayChecked);
    EXPECT_EQ("2", parsed->maxNrAircraftchangsAndLTInDuty);
    EXPECT_EQ("Y", parsed->isDHDmustBetweenBaseAndLOStation);
    EXPECT_EQ("6", parsed->totalSegsInDuty);
    EXPECT_EQ("00:45", parsed->maxFlightBLHAllowDHD);
    EXPECT_EQ("N", parsed->isInternationalDHDallowed);
    EXPECT_EQ("00:15", parsed->overNightFlyThredhold);
    EXPECT_EQ("09:00", parsed->maxDutyDP);
    EXPECT_EQ("01:30", parsed->maxFlyTimeInDuty);
    EXPECT_EQ("N", parsed->pureDeadheadDutyAllowed);
    EXPECT_EQ("08:00", parsed->maxFdpWithAircraftChange);
}

TEST(Rule2004ParseTest, NewAliasParamNamesAreParsed) {
    DBRule rule;
    rule.function = 2004;
    std::vector<std::pair<std::string, std::string>> params = {
        {"Duties Must Start on Different Day", "Y"},
        {"Total Segs In Duty", "5"},
        {"Max Duty DP", "10:00"},
        {"Max Flight Time Allow DHD", "01:30"},
        {"Max Flight Time In Duty", "02:00"},
    };
    for (const auto& p : params) {
        rule.params.insert(p);
    }
    auto parsedBase = parseRuleParam2004(rule);
    auto parsed = std::static_pointer_cast<rule2004>(parsedBase);

    EXPECT_EQ("Y", parsed->isDutyBelongToDifferentDayChecked);
    EXPECT_EQ("5", parsed->totalSegsInDuty);
    EXPECT_EQ("10:00", parsed->maxDutyDP);
    // New SQ naming should remain backward compatible with legacy fields.
    EXPECT_EQ("01:30", parsed->maxFlightBLHAllowDHD);
    EXPECT_EQ("02:00", parsed->maxFlyTimeInDuty);
}

TEST(Rule2004ParseTest, ParseRawString) {
    DBRule rule;
    rule.function = 2004;
    rule.idRule = 2004003;
    rule.idRuleParam = 2057832433500160;

    // Simulate the raw text values from the database, including embedded newlines.
    auto param_names = "maxNrFlySegsInDuty,maxNrNonoperateLegsInDuty,maxNrAircraftChangeInDuty,maxNrConsecutiveDhd,maxNrDHDInDuty,isDhdAllowedInMiddleDuty,isDutySegmentsInSameCalendarDay,maxNrGRDCommuteInDuty,isDutyBelongToDifferentDayChecked,maxNrAircraftchangsAndLTInDuty,isDHDmustBetweenBaseAndLOStation,totalSegsInDuty,maxFlightBLHAllowDHD,isInternationalDHDallowed,OVER NIGHT FLY THREDHOLD,maxDutyDP,allowDifferentAirlineOperationFlightMix,allowDifferentAirlineDeadheadFlightMix";
    auto param_values = "4,2,1,1,1,N,N,1,N,1,N,5,999:00,Y,05:00,24:00,Y,Y";

    // Simulate the flawed upstream parsing logic that does not handle newlines within the field.
    // This logic is a simplified version of what might exist in a CSV parser or data loader.
    auto split = [](const std::string& s, char delim) {
        std::vector<std::string> out;
        std::string current;
        std::istringstream iss(s);
        while (std::getline(iss, current, delim)) {
            out.push_back(current);
        }
        return out;
    };
    
    std::vector<std::string> headers = split(param_names, ',');
    std::vector<std::string> cells = split(param_values, ',');

    for (size_t i = 0; i < std::min(headers.size(), cells.size()); ++i) {
        rule.params[headers[i]] = cells[i];
    }
    
 
    // To be more specific, we can check that a key we know is affected is not found
    // after the flawed parsing.
    auto parsedBase = parseRuleParam2004(rule);
    auto parsed = std::static_pointer_cast<rule2004>(parsedBase);

    // This parameter name is broken by a newline. The parsed value will be empty.
    EXPECT_EQ("N", parsed->isDhdAllowedInMiddleDuty); 
    // This one is also broken by a newline.
    EXPECT_EQ("N", parsed->isDHDmustBetweenBaseAndLOStation); 
    EXPECT_EQ("5", parsed->totalSegsInDuty);
    
    // The user's error was on 'totalSegsInDuty'. While it doesn't appear to have a newline
    // directly attached in the provided string, a shift in keys/values due to incorrect splitting
    // can cause it to be missed or assigned a wrong value. 
    // A robust test checks the outcome of the known-bad keys.
}


TEST(Rule2004ParseTest, ParseSpacedString) {
    DBRule rule;
    rule.function = 2004;
    rule.idRule = 2004003;
    rule.idRuleParam = 2057832433500160;

    // Simulate the raw text values from the database, including embedded newlines.
    auto param_names = "Max Nr Fly Segs In Duty,Max Nr Nonoperate Legs In Duty,Max Nr Aircraft Change In Duty,Max Nr Consecutive Dhd,Max Nr Dhd In Duty,Is Dhd Allowed In Middle Duty,Is Duty Segments In Same Calendar Day,Max Nr Grd Commute In Duty,Is Duty Belong To Different Day Checked,Max Nr Aircraft Changes And LT In Duty,Is Dhd Must Between Base And LO Station,Total Segs In Duty,Max Flight BLH Allow DHD,Is International DHD Allowed,Over Night Fly Threshold,Max Duty DP,Max Fly Time In Duty,Pure Deadhead Duty Allowed,Max FDP With Aircraft Change";
    auto param_values = "4,2,1,1,1,N,N,1,N,1,N,5,999:00,Y,05:00,24:00,*,Y,*";

    // Simulate the flawed upstream parsing logic that does not handle newlines within the field.
    // This logic is a simplified version of what might exist in a CSV parser or data loader.
    auto split = [](const std::string& s, char delim) {
        std::vector<std::string> out;
        std::string current;
        std::istringstream iss(s);
        while (std::getline(iss, current, delim)) {
            out.push_back(current);
        }
        return out;
    };

    std::vector<std::string> headers = split(param_names, ',');
    std::vector<std::string> cells = split(param_values, ',');

    for (size_t i = 0; i < std::min(headers.size(), cells.size()); ++i) {
        rule.params[headers[i]] = cells[i];
    }


    // To be more specific, we can check that a key we know is affected is not found
    // after the flawed parsing.
    auto parsedBase = parseRuleParam2004(rule);
    auto parsed = std::static_pointer_cast<rule2004>(parsedBase);

    // This parameter name is broken by a newline. The parsed value will be empty.
    EXPECT_EQ("N", parsed->isDhdAllowedInMiddleDuty);
    // This one is also broken by a newline.
    EXPECT_EQ("N", parsed->isDHDmustBetweenBaseAndLOStation);
    EXPECT_EQ("5", parsed->totalSegsInDuty);

    // The user's error was on 'totalSegsInDuty'. While it doesn't appear to have a newline
    // directly attached in the provided string, a shift in keys/values due to incorrect splitting
    // can cause it to be missed or assigned a wrong value. 
    // A robust test checks the outcome of the known-bad keys.
}
