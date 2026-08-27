#include <gtest/gtest.h>

#include "RuleEngine/rule/rule7451/RestrictCoterminalDutyConnectionForSQRule.h"
#include "RuleEngine/rule/rule7451/RestrictCoterminalDutyConnectionForSQRuleParam.h"

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

    void deleteViolations(std::vector<RULE_VIOLATION*>& violations) {
        for (auto* rv : violations) {
            delete rv;
        }
        violations.clear();
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
    std::unique_ptr<Duty> makeDuty(const std::vector<std::unique_ptr<Segment>>& segments) {
        if (segments.empty()) {
            return nullptr;
        }

        std::vector<Segment*> segPtrs;
        for (const auto& s : segments) {
            segPtrs.push_back(s.get());
        }

        auto reportTime = 60 * 60;  // 1 hour report time
        auto debriefTime = 30 * 60; // 30 minutes debrief

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

        return duty;
    }

    // Helper to create a Rule 7451 row for connection restrictions
    DBRule makeRule7451ConnectionRow(int rowNum,
        const std::string& prevArr,
        const std::string& prevAssign,
        const std::string& nextDep,
        const std::string& nextAssign) {
        DBRule rule{};
        rule.idRule = 7451001;
        rule.function = 7451;
        rule.tableNum = 1;
        rule.rowNum = rowNum;
        rule.idRuleParam = 745102000 + rowNum;
        rule.overridebility = "H";
        rule.severity = 2;
        rule.reference = "SIA";
        rule.params["prev duty arrival"] = prevArr;
        rule.params["prev duty assignment"] = prevAssign;
        rule.params["next duty depart"] = nextDep;
        rule.params["next duty assignment"] = nextAssign;
        return rule;
    }

}  // namespace

// Test fixture for SIA 6.5 Co-terminal rule tests.
class Sia65CoterminalTest : public ::testing::Test {
protected:
    void TearDown() override {
        deleteViolations(_violationStorage);
    }

    void SetUp() override {
        _ctx = SIATest::buildCrewDataContext({
            {"SIN", 480, "Asia/Singapore"},
            {"HKG", 480, "Asia/Hong_Kong"},
            {"SHJ", 240, "Asia/Dubai"},
            {"DXB", 240, "Asia/Dubai"},
            {"LHR", 0, "Europe/London"},
            {"LGW", 0, "Europe/London"},
            });

        auto addAirport = [&](const char* code, const char* city) {
            auto a = std::make_unique<DBAirport>();
            std::strncpy(a->airport, code, 3);
            a->airport[3] = '\0';
            std::strncpy(a->city, city, 3);
            a->city[3] = '\0';
            _ctx->airportCodeMap[code] = a.get();
            _airportStorage.push_back(std::move(a));
        };
        addAirport("SIN", "SIN");
        addAirport("HKG", "HKG");
        // SHJ and DXB are co-terminals, sharing the same city code "DXB"
        addAirport("SHJ", "DXB");
        addAirport("DXB", "DXB");
        // LHR and LGW are co-terminals, sharing the same city code "LON"
        addAirport("LHR", "LON");
        addAirport("LGW", "LON");

        // Rule 7451, Table 2: Connection Restrictions
        // Restricts any duty ending at LHR to any duty starting at LGW
        _input.dbRules.push_back(makeRule7451ConnectionRow(1, "LHR", "*", "LGW", "*"));
        // Restricts any duty ending at LGW to any position duty starting at LHR
        _input.dbRules.push_back(makeRule7451ConnectionRow(2, "LGW", "*", "LHR", "MVP"));
    }

    void configureRule(RestrictCoterminalDutyConnectionForSQRule& rule) {
        rule.setApplication(BATCH_LEGALITY);
        rule.setDataContext(_ctx);
        rule.setRuleViolation(&_violationStorage);
        rule.setViolations(&_violationMessages);
    }

    RuleInput _input;
    std::shared_ptr<CrewDataContext> _ctx;
    std::vector<RULE_VIOLATION*> _violationStorage;
    std::vector<std::string> _violationMessages;
    std::vector<std::unique_ptr<DBAirport>> _airportStorage;
    SIATest::SiaRuleParamGuard _paramGuard;
};

// Test Case from Excel: Legal connection between SHJ and DXB
TEST_F(Sia65CoterminalTest, SHJ_DXB_LegalCoterminalConnection) {
    RestrictCoterminalDutyConnectionForSQRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<std::unique_ptr<Duty>> dutyStorage;
    std::vector<Duty*> duties;

    // Day 1: SQ 7952 SIN-HKG - 21:10 - 01:15 + 1
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        time_t depUtc = utcStrToUtc(const_cast<char*>("2025-12-01 13:10:00")); // 21:10 SIN
        time_t arrUtc = utcStrToUtc(const_cast<char*>("2025-12-01 17:15:00")); // 01:15+1 HKG
        dutySegs.push_back(makeSegment("SIN", "HKG", depUtc, arrUtc, "FLY", true, _ctx));
        dutyStorage.push_back(makeDuty(dutySegs));
        duties.push_back(dutyStorage.back().get());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // Day 3: SQ 7366 HKG-SHJ - 10:15 - 19:00
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        time_t depUtc = utcStrToUtc(const_cast<char*>("2025-12-03 02:15:00")); // 10:15 HKG
        time_t arrUtc = utcStrToUtc(const_cast<char*>("2025-12-03 15:00:00")); // 19:00 SHJ
        dutySegs.push_back(makeSegment("HKG", "SHJ", depUtc, arrUtc, "FLY", true, _ctx));
        dutyStorage.push_back(makeDuty(dutySegs));
        duties.push_back(dutyStorage.back().get());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    // Day 4: PU SQ 495 DXB-SIN - 15:50 - 23:15
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        time_t depUtc = utcStrToUtc(const_cast<char*>("2025-12-04 11:50:00")); // 15:50 DXB
        time_t arrUtc = utcStrToUtc(const_cast<char*>("2025-12-04 15:15:00")); // 23:15 SIN
        dutySegs.push_back(makeSegment("DXB", "SIN", depUtc, arrUtc, "PU", false, _ctx));
        dutyStorage.push_back(makeDuty(dutySegs));
        duties.push_back(dutyStorage.back().get());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_EQ(0, _violationStorage.size());
}

// Test Case: SIN-(FLY)-LHR, rest, LGW-(FLY)-SIN -> Illegal
TEST_F(Sia65CoterminalTest, LHR_LGW_FlyFly_IsIllegal) {
    RestrictCoterminalDutyConnectionForSQRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<std::unique_ptr<Duty>> dutyStorage;
    std::vector<Duty*> duties;

    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        time_t depUtc = utcStrToUtc(const_cast<char*>("2025-12-01 15:00:00"));
        time_t arrUtc = depUtc + 14 * 3600;
        dutySegs.push_back(makeSegment("SIN", "LHR", depUtc, arrUtc, "FLY", true, _ctx));
        dutyStorage.push_back(makeDuty(dutySegs));
        duties.push_back(dutyStorage.back().get());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        time_t depUtc = utcStrToUtc(const_cast<char*>("2025-12-03 10:00:00"));
        time_t arrUtc = depUtc + 13 * 3600;
        dutySegs.push_back(makeSegment("LGW", "SIN", depUtc, arrUtc, "FLY", true, _ctx));
        dutyStorage.push_back(makeDuty(dutySegs));
        duties.push_back(dutyStorage.back().get());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    EXPECT_EQ(1, _violationStorage.size());
}

// Test Case: SIN-(FLY)-LGW, rest, LHR-(DHD)-SIN -> Illegal
TEST_F(Sia65CoterminalTest, LGW_LHR_FlyDhd_IsIllegal) {
    RestrictCoterminalDutyConnectionForSQRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<std::unique_ptr<Duty>> dutyStorage;
    std::vector<Duty*> duties;

    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        time_t depUtc = utcStrToUtc(const_cast<char*>("2025-12-01 15:00:00"));
        time_t arrUtc = depUtc + 14 * 3600;
        dutySegs.push_back(makeSegment("SIN", "LGW", depUtc, arrUtc, "FLY", true, _ctx));
        dutyStorage.push_back(makeDuty(dutySegs));
        duties.push_back(dutyStorage.back().get());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        time_t depUtc = utcStrToUtc(const_cast<char*>("2025-12-03 10:00:00"));
        time_t arrUtc = depUtc + 13 * 3600;
        dutySegs.push_back(makeSegment("LHR", "SIN", depUtc, arrUtc, "MVP", false, _ctx));
        dutyStorage.push_back(makeDuty(dutySegs));
        duties.push_back(dutyStorage.back().get());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);

    EXPECT_FALSE(rule.CheckRule(&pairing));
    EXPECT_EQ(1, _violationStorage.size());
}

// Test Case: SIN-(FLY)-LGW, rest, LHR-(FLY)-SIN -> Legal
TEST_F(Sia65CoterminalTest, LGW_LHR_FlyFly_IsLegal) {
    RestrictCoterminalDutyConnectionForSQRule rule(nullptr, _input);
    configureRule(rule);

    std::vector<std::unique_ptr<Segment>> segStorage;
    std::vector<std::unique_ptr<Duty>> dutyStorage;
    std::vector<Duty*> duties;

    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        time_t depUtc = utcStrToUtc(const_cast<char*>("2025-12-01 15:00:00"));
        time_t arrUtc = depUtc + 14 * 3600;
        dutySegs.push_back(makeSegment("SIN", "LGW", depUtc, arrUtc, "FLY", true, _ctx));
        dutyStorage.push_back(makeDuty(dutySegs));
        duties.push_back(dutyStorage.back().get());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }
    {
        std::vector<std::unique_ptr<Segment>> dutySegs;
        time_t depUtc = utcStrToUtc(const_cast<char*>("2025-12-03 10:00:00"));
        time_t arrUtc = depUtc + 13 * 3600;
        dutySegs.push_back(makeSegment("LHR", "SIN", depUtc, arrUtc, "FLY", true, _ctx));
        dutyStorage.push_back(makeDuty(dutySegs));
        duties.push_back(dutyStorage.back().get());
        for (auto& s : dutySegs) segStorage.push_back(std::move(s));
    }

    Pairing pairing(duties);

    EXPECT_TRUE(rule.CheckRule(&pairing));
    EXPECT_EQ(0, _violationStorage.size());
}
