#include <gtest/gtest.h>

#include "RuleEngine/rule/rule7421/AcopSlipPatternRule.h"
#include "RuleEngine/rule/rule7421/AcopSlipPatternRuleParam.h"

#include "SIA_CommonTestConfig.h"
#include "orUtil/TimeZoneUtil/TimezoneUtils.h"
#include "RuleEngine/rule/framework/RuleInput.h"
#include "RuleSystemDefine.h"
#include "db/CrewDB.h"
#include "orUtil/UtilFunc.h"

#include <cstring>
#include <memory>
#include <string>
#include <vector>

namespace {

// Helper to create a flight/ground segment.
std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     time_t startUtc,
                                     time_t endUtc,
                                     const std::string& flightNumber,
                                     const std::string& assignment,
                                     bool isOperating,
                                     const std::shared_ptr<CrewDataContext>& ctx) {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setFleetCD("SQ");
    seg->setFlightNumber(flightNumber);
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
std::unique_ptr<Duty> makeDuty(const std::vector<std::unique_ptr<Segment>>& segments) {
    if (segments.empty()) {
        return nullptr;
    }
    bool isSby = false;
    std::vector<Segment*> segPtrs;
    for (const auto& s : segments) {
        if (s->getAssignment() == "SBY") {
            isSby = true;
		}   
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

DBRule makeRule() {
    DBRule rule{};
    rule.idRule = 7421001;
    rule.function = 7421;
    rule.tableNum = 1;
    rule.rowNum = 1;
    rule.idRuleParam = 742100001;
    rule.overridebility = "H";
    rule.severity = 2;
    rule.reference = "SIA";
    rule.params["Clause"] = "(4)(a)(i)";
    rule.params["Pattern"] = "SIN-CLON-SIN";
    rule.params["Slip station"] = "CLON";
    rule.params["Group"] = "DEFAULT";
    rule.params["Priority"] = "1";
    rule.params["Slip Arr Is Operating"] = "*";
    rule.params["Slip Dep Is Operating"] = "*";
    rule.params["Duty Assignment before slip"] = "*";
    rule.params["Duty Assignment after slip"] = "*";
    rule.params["Reporting time at base"] = "22:00-02:59";
    rule.params["Previous Slip Local Nights"] = "*";
    rule.params["Previous Slip had standby"] = "*";
    rule.params["Min slip hours"] = "0";
    rule.params["Min slip local nights"] = "2";
    rule.params["Min Slip Dep Time after LN"] = "06:00";
    rule.params["Duty After Hours"] = "*";
    rule.params["Duty After Local Nights"] = "*";
    rule.params["Duty Time After LN"] = "00:00";
    rule.params["Max Standby periods"] = "2";
    rule.params["Max standby hours"] = "6";
    rule.params["Allowed duty within slip"] = "*";
    rule.params["DO after duty"] = "0";
    rule.params["Extra Condition"] = "*";
    return rule;
}

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

}  // namespace

// Test fixture for SIA 5.8 (4a) SIN-LON-SIN rule tests (city token uses "CLON").
class Sia584aSINLONSINTest : public ::testing::Test {
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
            {"LHR", 0, "Europe/London"}
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
        addAirport("LHR", "GB", "EUR", "LON");
        
        _input.dbRules.push_back(makeRule());
    }

    void configureRule(AcopSlipPatternRule& rule) {
        rule.setApplication(BATCH_LEGALITY);
        rule.setDataContext(_ctx);
        rule.setRuleViolation(&_violationStorage);
        rule.setViolations(&_violationMessages);
    }
    
    RuleInput _input;
    std::shared_ptr<CrewDataContext> _ctx;
    std::vector<RULE_VIOLATION*> _violationStorage;
    std::vector<std::string> _violationMessages;
    SIATest::SiaRuleParamGuard _paramGuard;
};

TEST_F(Sia584aSINLONSINTest, Illegal_Without_2LN_Rest) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;
    
    const long SIN_LHR_DURATION = 14 * 3600 + 30 * 60; // 14.5 hours
    const long LHR_SIN_DURATION = 13 * 3600; // 13 hours

    // Duty 1: SIN-LHR, departing 23:00 LT (reporting 22:00 LT, which triggers the 22:00–02:59 window).
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        time_t depSinUtc = SIATest::utcFromLocal("2025-12-01 23:00:00", "SIN", _ctx);
        time_t arrLhrUtc = depSinUtc + SIN_LHR_DURATION;
        dutySegs.push_back(makeSegment("SIN", "LHR", depSinUtc, arrLhrUtc, "SQ322", "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Duty 2: LHR-SIN on Day 3, resulting in < 2LN rest
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        time_t depLhrUtc = SIATest::utcFromLocal("2025-12-03 21:00:00", "LHR", _ctx);
        time_t arrSinUtc = depLhrUtc + LHR_SIN_DURATION;
        dutySegs.push_back(makeSegment("LHR", "SIN", depLhrUtc, arrSinUtc, "SQ317", "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    Pairing pairing(duties);
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}

TEST_F(Sia584aSINLONSINTest, Legal_With_2LN_Rest) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;
    
    const long SIN_LHR_DURATION = 14 * 3600 + 30 * 60; // 14.5 hours
    const long LHR_SIN_DURATION = 13 * 3600; // 13 hours

    // Duty 1: SIN-LHR, departing 23:00 LT (reporting 22:00 LT, which triggers the 22:00–02:59 window).
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        time_t depSinUtc = SIATest::utcFromLocal("2025-12-01 23:00:00", "SIN", _ctx);
        time_t arrLhrUtc = depSinUtc + SIN_LHR_DURATION;
        dutySegs.push_back(makeSegment("SIN", "LHR", depSinUtc, arrLhrUtc, "SQ322", "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Duty 2: LHR-SIN on Day 4, resulting in 2LN rest
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        time_t depLhrUtc = SIATest::utcFromLocal("2025-12-04 21:00:00", "LHR", _ctx);
        time_t arrSinUtc = depLhrUtc + LHR_SIN_DURATION;
        dutySegs.push_back(makeSegment("LHR", "SIN", depLhrUtc, arrSinUtc, "SQ317", "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    Pairing pairing(duties);
    
    EXPECT_TRUE(rule.CheckRule(&pairing));
}
