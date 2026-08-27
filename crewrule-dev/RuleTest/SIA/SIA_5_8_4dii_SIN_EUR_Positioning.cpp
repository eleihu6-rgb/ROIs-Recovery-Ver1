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

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

// Helper to create a flight/ground segment.
std::unique_ptr<Segment> makeSegment(const std::string& dep,
                                     const std::string& arr,
                                     time_t startUtc,
                                     time_t endUtc,
                                     const std::string& assignment,
                                     bool isOperating,
                                     const std::shared_ptr<CrewDataContext>& ctx) {
    auto seg = std::make_unique<Segment>();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setFleetCD("SQ");
    seg->setFlightNumber("SQTEST");
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
std::unique_ptr<Duty> makeDuty(const std::vector<std::unique_ptr<Segment>>& segments,
                               int reportTimeMinutes = 60, int debriefTimeMinutes = 30, int transportTimeMinutes = 60) {
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

    auto reportTime = reportTimeMinutes * 60;  // in seconds
	auto debriefTime = debriefTimeMinutes * 60; // in seconds
	auto transportTime = transportTimeMinutes * 60; // in seconds
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

    const time_t dutyStartUtc = duty->getStartTimeUtcAct();
    const time_t dutyEndUtc = duty->getEndTimeUtcAct();
    const int fdpMinutes = (dutyEndUtc > dutyStartUtc) ? static_cast<int>((dutyEndUtc - dutyStartUtc) / 60) : 0;
    duty->setPlanFDP(fdpMinutes);
    duty->setActualFDP(fdpMinutes);

    return duty;
}

DBRule makeAcopTableBRow(long long ruleId,
                         int rowNum,
                         const std::string& clause,
                         const std::string& pattern,
                         const std::string& slipStation,
                         int priority,
                         const std::string& dutyBefore,
                         const std::string& dutyAfter,
                         const std::string& reportTimeWindow,
                         const std::string& minSlipHours,
                         const std::string& minSlipLocalNights,
                         const std::string& maxStandbyPeriods,
                         const std::string& maxStandbyHours,
                         const std::string& allowedDutyWithinSlip,
                         const std::string& doAfterDuty,
                         const std::string& extraCondition,
                         const std::string& group = "DEFAULT") {
    auto deriveSlipIsOperating = [](const std::string& dutyAssignmentFilter) -> std::string {
        const std::string trimmedUpper = strToUpper(trim(dutyAssignmentFilter));
        if (trimmedUpper.empty() || trimmedUpper == "*") {
            return "*";
        }

        std::vector<std::string> tokens;
        split(trimmedUpper.c_str(), '|', tokens);
        std::vector<std::string> normalized;
        normalized.reserve(tokens.size());
        for (auto& t : tokens) {
            const std::string token = strToUpper(trim(t));
            if (!token.empty()) {
                normalized.push_back(token);
            }
        }

        if (normalized.size() == 1 && normalized.front() == "MVP") {
            return "N";
        }
        for (const auto& token : normalized) {
            if (token == "FLY" || token == "MVO") {
                return "Y";
            }
        }
        return "*";
    };

    DBRule rule{};
    rule.idRule = ruleId;
    rule.function = 7421;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.idRuleParam = 742100000 + rowNum;
    rule.overridebility = "H";
    rule.severity = 2;
    rule.reference = "SIA";
    rule.params["Clause"] = clause;
    rule.params["Pattern"] = pattern;
    rule.params["Slip station"] = slipStation;
    rule.params["Group"] = group;
    rule.params["Priority"] = std::to_string(priority);
    rule.params["Slip Arr Is Operating"] = deriveSlipIsOperating(dutyBefore);
    rule.params["Slip Dep Is Operating"] = deriveSlipIsOperating(dutyAfter);
    rule.params["Duty Assignment before slip"] = "*";
    rule.params["Duty Assignment after slip"] = "*";
    rule.params["Reporting time at base"] = reportTimeWindow;
    rule.params["Min slip hours"] = minSlipHours;
    rule.params["Min slip local nights"] = minSlipLocalNights;
    rule.params["Min Slip Dep Time after LN"] = "*";
    rule.params["Max Standby periods"] = maxStandbyPeriods;
    rule.params["Max standby hours"] = maxStandbyHours;
    rule.params["Allowed duty within slip"] = allowedDutyWithinSlip;
    // Fill other params with defaults to avoid issues
    rule.params["Previous Slip Local Nights"] = "*";
    rule.params["Previous Slip had standby"] = "*";
    rule.params["Duty After Hours"] = "*";
    rule.params["Duty After Local Nights"] = "*";
    rule.params["Duty Time After LN"] = "*";
    rule.params["DO after duty"] = doAfterDuty;
    rule.params["Extra Condition"] = extraCondition;
    return rule;
}

void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
    for (auto* rv : violations) {
        delete rv;
    }
    violations.clear();
}

}  // namespace

// Test fixture for SIA 5.8 (4dii) rule tests.
class Sia584diiSinEurPositioningTest : public ::testing::Test {
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
            {"MAN", 0, "Europe/London"}, // Assuming London time zone for Manchester
            {"IAH", -360, "America/Chicago"} // Assuming Chicago time zone for Houston
        });

        // Location matching (e.g. "NZ") requires airportCodeMap entries.
        auto addAirport = [&](const char* code, const char* country, const char* category) {
            auto* a = new DBAirport();
            std::strncpy(a->airport, code, 3);
            a->airport[3] = '\0';
            std::strncpy(a->country, country, 2);
            a->country[2] = '\0';
            a->category = category;
            _ctx->airportCodeMap[code] = a;
        };
        addAirport("SIN", "SG", "SEA");
        addAirport("MAN", "GB", "EUR"); // Europe category
        addAirport("FRA", "DE", "EUR"); 
        
        // Rule: (4)(d)(ii) If the slip in Europe is less than 24 hours but includes a local night, 
        // the crew can be required for positioning, or a flight duty period of up to six hours. 
        // If this is required, they shall then have a day free of duty before being required for any further duties.
        auto row = makeAcopTableBRow(7421004, 4, "(4)(d)(ii)", "*", "REUR", 1, "MVP", "*", "*", "*", "1", "0", "0", "POS | FDP <=6h", "1", "*");
        // Internal duty timing should be controlled by duty-after constraints, not slip-level mins.
        row.params["Duty After Local Nights"] = "1";
        _input.dbRules.push_back(row);

        // Add control parameters as a DBRule with tableNum = 2
        DBRule controlRule{};
        controlRule.idRule = 7421004;
        controlRule.function = 7421;
        controlRule.tableNum = 2; // Indicate this is a control parameter rule
        controlRule.params["Rest Starts After"] = "Y"; // 'Y' maps to AcopRestStartsAfter::Debrief (transport counts as rest)
        controlRule.params["Sby Reduces Rest and LN"] = "Y";
        controlRule.params["Standby Assignments"] = "SBY";
        // The prompt also specified "Transport Y", but it's not a parameter handled directly by AcopSlipPatternControlParam
        // and its effects on rest calculation are implicitly handled by "Rest Starts After".
        _input.dbRules.push_back(controlRule);


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

// Test Case 1: Legal day free of duty after FDP of up to 6h
TEST_F(Sia584diiSinEurPositioningTest, LegalDayFreeAfterFdpUpTo6h) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: [PU] SIN-MAN (Positioning) - arriveDuty
    // Flight duration: 14h

    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "MAN"
            , utcFromString("2025-12-01 06:00:00"), utcFromString("2025-12-01 20:00:00"), "DHD", false, _ctx)); // Positioning Unit
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2 (early): MAN-FRA (FDP <= 6h, internal duty)
    // Assume 12.5 hours rest in MAN after SIN-MAN duty with 1 LN

    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("MAN", "FRA"
            , utcFromString("2025-12-02 11:00:00"), utcFromString("2025-12-02 14:00:00"), "FLY", true, _ctx)); // FDP up to 6h
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Long rest after MAN-MAN to satisfy "day free of duty" (e.g. 24h+)

    // Day 4: FRA-MAN (departDuty from Europe)
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("FRA", "MAN"
            , utcFromString("2025-12-04 08:00:00"), utcFromString("2025-12-04 11:00:00"), "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 5: MAN-SIN
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("MAN", "SIN"
            , utcFromString("2025-12-05 08:00:00"), utcFromString("2025-12-05 22:00:00"), "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    
    SIATest::applyReportReleaseToDuties(duties, {60, 30, 60});
    Pairing pairing(duties);
    
    EXPECT_TRUE(rule.CheckRule(&pairing));
}

// Test Case 2: Illegal, no day free of duty after FDP of up to 6h
TEST_F(Sia584diiSinEurPositioningTest, IllegalNoDayFreeAfterFdpUpTo6h) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: [PU] SIN-MAN (Positioning) - arriveDuty
    // Flight duration: 14h

    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "MAN"
            , utcFromString("2025-12-01 06:00:00"), utcFromString("2025-12-01 20:00:00"), "DHD", false, _ctx)); // Positioning Unit
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2 (early): MAN-FRA (FDP <= 6h, internal duty)
    // Assume 12.5 hours rest in MAN after SIN-MAN duty with 1 LN

    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("MAN", "FRA"
            , utcFromString("2025-12-02 11:00:00"), utcFromString("2025-12-02 14:00:00"), "FLY", true, _ctx)); // FDP up to 6h
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Long rest after MAN-MAN to satisfy "day free of duty" (e.g. 24h+)

    // Day 3: FRA-MAN (departDuty from Europe)
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("FRA", "MAN"
            , utcFromString("2025-12-03 08:00:00"), utcFromString("2025-12-03 11:00:00"), "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 5: MAN-SIN
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("MAN", "SIN"
            , utcFromString("2025-12-05 08:00:00"), utcFromString("2025-12-05 22:00:00"), "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    SIATest::applyReportReleaseToDuties(duties, { 60, 30, 60 });
    Pairing pairing(duties);
    
    EXPECT_FALSE(rule.CheckRule(&pairing));
}

// Test Case 2: Illegal not enough rest after Positioning + FDP of up to 6h
TEST_F(Sia584diiSinEurPositioningTest, IllegalNotEnoughRestAfterPositioningFdpUpTo6h) {
    AcopSlipPatternRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<Duty*> duties;

    // Day 1: [PU] SIN-MAN (Positioning) - arriveDuty
    // Flight duration: 14h

    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("SIN", "MAN"
            , utcFromString("2025-12-01 06:00:00"), utcFromString("2025-12-01 20:00:00"), "DHD", false, _ctx)); // Positioning Unit
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 2 (early): MAN-FRA (FDP <= 6h, internal duty)
    // Short rest in MAN after SIN-MAN duty (no local night).

    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("MAN", "FRA"
            , utcFromString("2025-12-02 04:00:00"), utcFromString("2025-12-02 07:00:00"), "FLY", true, _ctx)); // FDP up to 6h
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Long rest after MAN-MAN to satisfy "day free of duty" (e.g. 24h+)

    // Day 4: FRA-MAN (departDuty from Europe)
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("FRA", "MAN"
            , utcFromString("2025-12-04 08:00:00"), utcFromString("2025-12-04 11:00:00"), "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    // Day 5: MAN-SIN
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        dutySegs.push_back(makeSegment("MAN", "SIN"
            , utcFromString("2025-12-05 08:00:00"), utcFromString("2025-12-05 22:00:00"), "FLY", true, _ctx));
        duties.push_back(makeDuty(dutySegs).release());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    SIATest::applyReportReleaseToDuties(duties, { 60, 30, 60 });
    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
}
