#include <gtest/gtest.h>

#include "SIA_CommonTestConfig.h"
#include "orUtil/TimeZoneUtil/TimezoneUtils.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleSystemDefine.h"
#include "db/CrewDB.h"
#include "orUtil/UtilFunc.h"
#include "RuleEngine/rule/framework/utils/TimeUtils.h"
#include "RuleEngine/rule/framework/Rule.h"
#include "RuleEngine/rule/rule7467/LimitRestTimeBetweenFlightsForSQRule.h"

#include <cstring>
#include <memory>
#include <string>
#include <vector>

namespace {

// Helper functions (copied from SIA_5_8_10_Cairo_and_Istanbul.cpp and adapted)
time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

// Helper to create a flight/ground segment.
std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     const std::string& flightNumber, // Added flightNumber parameter
                                     time_t startUtc,
                                     time_t endUtc,
                                     const std::string& assignment,
                                     bool isOperating,
                                     const std::shared_ptr<CrewDataContext>& ctx) {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setFleetCD("SQ");
    seg->setFlightNumber(flightNumber); // Use the provided flight number
    seg->setAssignment(assignment);
    seg->setIsOperating(isOperating);

    seg->setStartTimeUtcAct(startUtc);
    seg->setEndTimeUtcAct(endUtc);
    seg->setStartTimeUtcSch(startUtc);
    seg->setEndTimeUtcSch(endUtc);

    const std::string depZoneId = ctx->getAirportZoneId(dep);
    const std::string arrZoneId = ctx->getAirportZoneId(arr);
    seg->setStartTimeLocAct(TimezoneUtils::GetLocalTime(startUtc, depZoneId));
    seg->setEndTimeLocAct(TimezoneUtils::GetLocalTime(endUtc, arrZoneId));
    seg->setStartTimeLocSch(seg->getStartTimeLocAct());
    seg->setEndTimeLocSch(seg->getEndTimeLocAct());

    return seg;
}

// Helper to create a duty from a vector of segments.
std::unique_ptr<Duty> makeDuty(const std::vector<std::unique_ptr<Segment>>& segments, bool isSby = false) {
    if (segments.empty()) {
        return nullptr;
    }
    
    std::vector<Segment*> segPtrs;
    for (const auto& s : segments) {
        segPtrs.push_back(s.get());
    }

    auto reportTime = 60 * 60;  // 1 hour report time
	auto debriefTime = 30 * 60; // 30 minutes debrief
	auto transportTime = 60 * 60; // 1 hour transportation
    if (isSby) {
        reportTime = 0;
        debriefTime = 0;
		transportTime = 0;
    }

    auto duty = std::make_unique<Duty>(segPtrs);
    duty->setStartTimeUtcAct(segments.front()->getStartTimeUtcAct() - reportTime);
    duty->setEndTimeUtcAct(segments.back()->getEndTimeUtcAct() + debriefTime);
    duty->setStartTimeLocAct(segments.front()->getStartTimeLocAct() - reportTime);
    duty->setEndTimeLocAct(segments.back()->getEndTimeLocAct() + debriefTime);
    duty->setDepartureStation(segments.front()->getDepStation());
    duty->setArrivalStation(segments.back()->getArrStation());
    duty->setMinBrief(reportTime / 60);
	duty->setActualBriefMin(reportTime / 60);
	duty->setMinDebrief(debriefTime / 60);
	duty->setActualDebriefMin(debriefTime / 60);
	duty->setMinDropoff(transportTime / 60);
	duty->setActualDropoffMin(transportTime / 60);
    return duty;
}

DBRule makeRule7467Row(int rowNum,
                       const std::string& type,
                       const std::string& flightNoA,
                       const std::string& depArrA,
                       const std::string& flightNoB,
                       const std::string& depArrB,
                       const std::string& minTimeLimit,
                       const std::string& maxTimeLimit,
                       int penalty,
                       const std::string& active,
                       const std::string& comment,
                       int severity = 1) {
    DBRule rule{};
    rule.idRule = 7467;
    rule.function = 7467;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.severity = severity;
    rule.idRuleParam = 7467000 + rowNum;
    rule.overridebility = "S";
    rule.reference = "SIA";
    rule.params["TYPE"] = type;
    rule.params["FLIGHT NO A"] = flightNoA;
    rule.params["DEP-ARR A"] = depArrA;
    rule.params["FLIGHT NO B"] = flightNoB;
    rule.params["DEP-ARR B"] = depArrB;
    rule.params["MIN TIME LIMIT"] = minTimeLimit;
    rule.params["MAX TIME LIMIT"] = maxTimeLimit;
    rule.params["PENALTY"] = std::to_string(penalty);
    rule.params["ACTIVE(Y/N)"] = active;
    rule.params["COMMENT"] = comment;
    rule.params["SEVERITY"] = std::to_string(severity);
    return rule;
}

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

}  // namespace

// Test fixture for SIA 6.15 Rest Time before flight.
class Sia615RestBeforeFlightTest : public ::testing::Test {
protected:
    void TearDown() override {
        deleteViolations(_violationStorage);
        if (_ctx) {
            for (auto& kv : _ctx->airportCodeMap) {
                delete kv.second;
            }
            _ctx->airportCodeMap.clear();
        }
    }

    void SetUp() override {
        _ctx = SIATest::buildCrewDataContext({
            {"SIN", 480, "Asia/Singapore"},
            {"SHJ", 240, "Asia/Dubai"} // Assuming SHJ uses Asia/Dubai (UTC+4)
        });

        auto addAirport = [&](const char* code, const char* country, const char* category, const char* city) {
            auto* a = new DBAirport();
            std::strncpy(a->airport, code, 3);
            a->airport[3] = '\0';
            if (city != nullptr) {
                std::strncpy(a->city, city, 3);
                a->city[3] = '\0';
            }
            std::strncpy(a->country, country, 2);
            a->country[2] = '\0';
            a->category = category;
            _ctx->airportCodeMap[code] = a;
        };
        addAirport("SIN", "SG", "SEA", "SIN");
        addAirport("SHJ", "AE", "ASW", "SHJ");
        
        _input.dbRules.push_back(makeRule7467Row(1,
                                                 "BEFORE",
                                                 "7395",
                                                 "SHJ-SIN",
                                                 "*",
                                                 "*",
                                                 "05:00",
                                                 "99:59",
                                                 0,
                                                 "Y",
                                                 "Rest Time before SHJ-SIN flight"));
    }

    RuleInput _input;
    std::shared_ptr<CrewDataContext> _ctx;
    std::vector<RULE_VIOLATION*> _violationStorage;
    SIATest::SiaRuleParamGuard _paramGuard; // Handles SIA_COMMON_TEST_PARAMS
};

// Test Case 1: Illegal - 2h15min rest before SHJ-SIN, required 5h.
TEST_F(Sia615RestBeforeFlightTest, IllegalRestBeforeSHJ_SIN) {
    LimitRestTimeBetweenFlightsForSQRule rule(nullptr, _input);
    rule.setApplication(BATCH_LEGALITY);
    std::vector<std::string> violationMessages;
    rule.setViolations(&violationMessages);
    rule.setRuleViolation(&_violationStorage);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SQ 7396 SIN-SHJ - 2045 - 0410 + 1 (UTC times, assuming SIN is UTC+8, SHJ is UTC+4)
    // SIN Dep (20:45 + 8h) = 12:45 UTC
    // SHJ Arr (04:10 + 4h) = 00:10 UTC (next day)
    time_t sinDepUtc = utcFromString("2025-12-10 12:45:00"); 
    time_t shjArrUtc = utcFromString("2025-12-11 00:10:00"); 
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "SHJ", "7396", sinDepUtc, shjArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2: SQ 7395 SHJ-SIN - 0625 - 1340 (UTC times, assuming SHJ is UTC+4, SIN is UTC+8)
    // SHJ Dep (06:25 + 4h) = 02:25 UTC
    // SIN Arr (13:40 + 8h) = 05:40 UTC
    time_t shjDepUtc = utcFromString("2025-12-11 02:25:00"); 
    time_t sinArrUtc = utcFromString("2025-12-11 05:40:00"); 
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SHJ", "SIN", "7395", shjDepUtc, sinArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    // Apply report/release times, including drop-off for rest calculation
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});

    rule.CheckRule(&pairing);

    // Expecting one violation for insufficient rest before SHJ-SIN
    EXPECT_GE(_violationStorage.size(), 1); 
    bool foundViolation = false;
    for (const auto* violation : _violationStorage) {
        if (violation->idRule == 7467) {
            foundViolation = true;
            // Optionally check violation message or other details
            // For example: EXPECT_EQ(violation->severity, 2); // Severity 2 for warning
        }
    }
    EXPECT_TRUE(foundViolation) << "Did not find expected violation for Rule 7467.";
}

// Test Case 2: Legal - 12h rest before SHJ-SIN, includes required 5h.
TEST_F(Sia615RestBeforeFlightTest, LegalRestBeforeSHJ_SIN) {
    LimitRestTimeBetweenFlightsForSQRule rule(nullptr, _input);
    rule.setApplication(BATCH_LEGALITY);
    std::vector<std::string> violationMessages;
    rule.setViolations(&violationMessages);
    rule.setRuleViolation(&_violationStorage);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: SQ 7396 SIN-SHJ - 2045 - 0410 + 1
    // SIN Dep (20:45 + 8h) = 12:45 UTC
    // SHJ Arr (04:10 + 4h) = 00:10 UTC (next day)
    time_t sinDepUtc = utcFromString("2025-12-10 12:45:00"); 
    time_t shjArrUtc = utcFromString("2025-12-11 00:10:00"); 
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "SHJ", "7396", sinDepUtc, shjArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 3: SQ 7395 SHJ-SIN - 0625 - 1340
    // SHJ Dep (06:25 + 4h) = 02:25 UTC (Day 3)
    // SIN Arr (13:40 + 8h) = 05:40 UTC (Day 3)
    time_t shjDepUtc = utcFromString("2025-12-12 02:25:00"); // Moved to Day 3
    time_t sinArrUtc = utcFromString("2025-12-12 05:40:00"); 
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SHJ", "SIN", "7395", shjDepUtc, sinArrUtc, "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});

    rule.CheckRule(&pairing);

    // Expecting no violations for sufficient rest before SHJ-SIN
    bool foundViolation = false;
    for (const auto* violation : _violationStorage) {
        if (violation->idRule == 7467) {
            foundViolation = true;
            break;
        }
    }
    EXPECT_FALSE(foundViolation) << "Unexpected violation found for Rule 7467.";
    EXPECT_EQ(_violationStorage.size(), 0) << "Expected no violations, but found " << _violationStorage.size();
}
