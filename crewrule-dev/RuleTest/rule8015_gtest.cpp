#include <gtest/gtest.h>

#include <memory>
#include <string>
#include <vector>

#include "db/Pairing.h"
#include "db/Duty.h"
#include "db/Segment.h"
#include "db/CrewDB.h"
#include "db/CrewDBUtil.h"
#include "db/RuleParams.h"
#include "RuleEngine/RuleEngine.h"
#include "RuleEngine/rule/rule7405/UlrDutyDefinition.h"
#include "GlobalDefinition/RuleEngineDef.h"
#include "orUtil/UtilFunc.h"

namespace {

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

CrewDataContext* g_ctx = nullptr;

// --- Rule helpers -----------------------------------------------------------

DBRule make8015Rule(int tableNum,
                    int rowNum,
                    const std::map<std::string, std::string>& params) {
    DBRule rule{};
    rule.idRule = 8015000 + tableNum * 10 + rowNum;
    rule.function = RULES::ULR_REST_CHECK;
    rule.tableNum = tableNum;
    rule.rowNum = rowNum;
    rule.params = params;
    return rule;
}

DBRule make7405Rule(int rowNum,
                    const std::map<std::string, std::string>& params) {
    DBRule rule{};
    rule.idRule = 7405000 + rowNum;
    rule.function = 7405;
    rule.tableNum = 1;
    rule.rowNum = rowNum;
    rule.params = params;
    return rule;
}

std::map<std::string, std::string> defaultPostDutyParams() {
    return {
        {"REST TYPE", "POST-DUTY-ULR"},
        {"MIN REST LENGTH", "48:00"},
        {"MIN CALENDAR DAYS", "99"},
        {"MIN LOCAL NIGHTS", "2"},
        {"LOCATION", "REST LOCATION"},
        {"EXCEPTION ASSIGNMENT GROUPS", "MVP|SBY"},
    };
}

std::map<std::string, std::string> defaultPreDutyParams() {
    return {
        {"REST TYPE", "PRE-DUTY-ULR"},
        {"MIN REST LENGTH", "48:00"},
        {"MIN CALENDAR DAYS", "99"},
        {"MIN LOCAL NIGHTS", "2"},
        {"LOCATION", "REST LOCATION"},
        {"EXCEPTION ASSIGNMENT GROUPS", "MVP|SBY"},
    };
}

std::map<std::string, std::string> defaultDefinitionParams() {
    return {
        {"(OR)LABELS", "*"},
        {"MAX SECTOR", "99"},
        {"MIN FLIGHT TIME", "17:00"},
        {"MIN FDP", "17:00"},
        {"(OR)SBY QUALIFIERS", "*"},
        {"EXCEPTION CODE", ""},
    };
}

// --- Segment / duty / pairing helpers --------------------------------------

Segment* makeFlight(const std::string& dep,
                    const std::string& arr,
                    time_t depUtc,
                    time_t arrUtc,
                    const std::string& ac,
                    const std::string& fltNum = "SQ1") {
    int offsetMinutes = 0;
    if (g_ctx) {
        auto it = g_ctx->airportUtcOffsetMap.find(dep);
        if (it != g_ctx->airportUtcOffsetMap.end()) {
            offsetMinutes = it->second;
        }
    }
    const time_t depLoc = depUtc + offsetMinutes * 60;
    const time_t arrLoc = arrUtc + offsetMinutes * 60;

    auto* seg = new Segment();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setStartTimeUtcSch(depUtc);
    seg->setEndTimeUtcSch(arrUtc);
    seg->setStartTimeUtcAct(depUtc);
    seg->setEndTimeUtcAct(arrUtc);
    seg->setStartTimeLocSch(depLoc);
    seg->setEndTimeLocSch(arrLoc);
    seg->setStartTimeLocAct(depLoc);
    seg->setEndTimeLocAct(arrLoc);
    seg->setFleetCD(ac.c_str());
    seg->setFlightNumber(fltNum.c_str());
    seg->setIsOperating(true);
    seg->setAssignment("FLY");
    return seg;
}

Segment* makePositioning(const std::string& dep,
                         const std::string& arr,
                         time_t depUtc,
                         time_t arrUtc) {
    int offsetMinutes = 0;
    if (g_ctx) {
        auto it = g_ctx->airportUtcOffsetMap.find(dep);
        if (it != g_ctx->airportUtcOffsetMap.end()) {
            offsetMinutes = it->second;
        }
    }
    const time_t depLoc = depUtc + offsetMinutes * 60;
    const time_t arrLoc = arrUtc + offsetMinutes * 60;

    auto* seg = new Segment();
    seg->setDepStation(dep);
    seg->setArrStation(arr);
    seg->setStartTimeUtcSch(depUtc);
    seg->setEndTimeUtcSch(arrUtc);
    seg->setStartTimeUtcAct(depUtc);
    seg->setEndTimeUtcAct(arrUtc);
    seg->setStartTimeLocSch(depLoc);
    seg->setEndTimeLocSch(arrLoc);
    seg->setStartTimeLocAct(depLoc);
    seg->setEndTimeLocAct(arrLoc);
    seg->setIsOperating(false);
    seg->setAssignment("MVP");
    return seg;
}

Duty* makeDuty(const std::vector<Segment*>& segments) {
    auto* duty = new Duty(segments);
    duty->setULR(false);
    if (!segments.empty()) {
        Segment* first = segments.front();
        Segment* last = segments.back();
        const time_t startUtc = first->getStartTimeUtcAct();
        const time_t endUtc = last->getEndTimeUtcAct();
        int offsetMinutes = 0;
        if (g_ctx) {
            auto it = g_ctx->airportUtcOffsetMap.find(first->getDepSta());
            if (it != g_ctx->airportUtcOffsetMap.end()) {
                offsetMinutes = it->second;
            }
        }
        const time_t startLoc = startUtc + offsetMinutes * 60;
        const time_t endLoc = endUtc + offsetMinutes * 60;

        duty->setDepStation(first->getDepSta());
        duty->setArrStation(last->getArrSta());
        duty->setStartTimeUtcSch(startUtc);
        duty->setEndTimeUtcSch(endUtc);
        duty->setStartTimeUtcAct(startUtc);
        duty->setEndTimeUtcAct(endUtc);
        duty->setStartTimeLocSch(startLoc);
        duty->setEndTimeLocSch(endLoc);
        duty->setStartTimeLocAct(startLoc);
        duty->setEndTimeLocAct(endLoc);
        duty->setAssignment(first->getAssignment());
        long fdp = static_cast<long>((endUtc - startUtc) / 60);
        duty->setPlanFDP(fdp);

        auto pickup = std::make_shared<PairingDutyNode>();
        pickup->setType("DUTY");
        pickup->setNode("PICKUP");
        pickup->setSequence(1);
        pickup->setStartTimeUtcAct(startUtc);
        pickup->setEndTimeUtcAct(startUtc);
        pickup->setStartTimeLocAct(startLoc);
        pickup->setEndTimeLocAct(startLoc);

        auto dropoff = std::make_shared<PairingDutyNode>();
        dropoff->setType("DUTY");
        dropoff->setNode("DROPOFF");
        dropoff->setSequence(2);
        dropoff->setStartTimeUtcAct(endUtc);
        dropoff->setEndTimeUtcAct(endUtc);
        dropoff->setStartTimeLocAct(endLoc);
        dropoff->setEndTimeLocAct(endLoc);

        duty->pairingDutyNodes.clear();
        duty->pairingDutyNodes.push_back(pickup);
        duty->pairingDutyNodes.push_back(dropoff);
    }
    return duty;
}

Duty* makeStandbyDuty(time_t startUtc, time_t endUtc, const std::string& station = "JFK") {
    int offsetMinutes = 0;
    if (g_ctx) {
        auto it = g_ctx->airportUtcOffsetMap.find(station);
        if (it != g_ctx->airportUtcOffsetMap.end()) {
            offsetMinutes = it->second;
        }
    }
    const time_t startLoc = startUtc + offsetMinutes * 60;
    const time_t endLoc = endUtc + offsetMinutes * 60;

    auto* duty = new Duty();
    duty->setStartTimeUtcSch(startUtc);
    duty->setEndTimeUtcSch(endUtc);
    duty->setStartTimeUtcAct(startUtc);
    duty->setEndTimeUtcAct(endUtc);
    duty->setStartTimeLocSch(startLoc);
    duty->setEndTimeLocSch(endLoc);
    duty->setStartTimeLocAct(startLoc);
    duty->setEndTimeLocAct(endLoc);
    duty->setDepStation(station);
    duty->setArrStation(station);
    duty->setAssignment("SBY");

    auto pickup = std::make_shared<PairingDutyNode>();
    pickup->setType("DUTY");
    pickup->setNode("PICKUP");
    pickup->setSequence(1);
    pickup->setStartTimeUtcAct(startUtc);
    pickup->setEndTimeUtcAct(startUtc);
    pickup->setStartTimeLocAct(startLoc);
    pickup->setEndTimeLocAct(startLoc);

    auto dropoff = std::make_shared<PairingDutyNode>();
    dropoff->setType("DUTY");
    dropoff->setNode("DROPOFF");
    dropoff->setSequence(2);
    dropoff->setStartTimeUtcAct(endUtc);
    dropoff->setEndTimeUtcAct(endUtc);
    dropoff->setStartTimeLocAct(endLoc);
    dropoff->setEndTimeLocAct(endLoc);

    duty->pairingDutyNodes.clear();
    duty->pairingDutyNodes.push_back(pickup);
    duty->pairingDutyNodes.push_back(dropoff);

    return duty;
}

Pairing* makePairing(const std::vector<Duty*>& duties, const std::string& base) {
    auto* pairing = new Pairing(duties);
    pairing->setBase(base);
    pairing->setPrimeActivity("FLY");
    if (!duties.empty()) {
        Duty* first = duties.front();
        Duty* last = duties.back();
        const time_t startUtc = first->getStartTimeUtcAct();
        const time_t endUtc = last->getEndTimeUtcAct();
        pairing->setStartTimeUtcAct(startUtc);
        pairing->setEndTimeUtcAct(endUtc);
        if (g_ctx) {
            int offsetMinutes = g_ctx->getAirportOffsetMinutes(base);
            const time_t startLoc = startUtc + offsetMinutes * 60;
            const time_t endLoc = endUtc + offsetMinutes * 60;
            pairing->setStartTimeLocAct(startLoc);
            pairing->setEndTimeLocAct(endLoc);
        }
    }
    return pairing;
}

void setupAssignmentGroups(CrewDataContext* db) {
    db->assignmentNameGroupMap["MVP"].insert("MVP");
    db->assignmentNameGroupMap["SBY"].insert("SBY");
}

// --- Test fixture -----------------------------------------------------------

class Rule8015PairingTest : public ::testing::Test {
public:
    SharedPtr<CrewDataContext> _ctx;
    std::unique_ptr<LegalityChecker> _checker;

    void SetUp() override {
        _ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
        g_ctx = _ctx.get();
        _ctx->scenario.airline = "SQ";
        _ctx->scenario.division = "P";
        _ctx->scenario.startDtUTC = utcFromString("2025-01-01 00:00:00");
        _ctx->scenario.endDtUTC = utcFromString("2025-12-31 23:59:59");

        _ctx->airportUtcOffsetMap["SIN"] = 8 * 60;   // UTC+8
        _ctx->airportUtcOffsetMap["JFK"] = -5 * 60;  // UTC-5
        _ctx->airportUtcOffsetMap["FRA"] = 1 * 60;   // UTC+1
        _ctx->airportUtcOffsetMap["MIA"] = -5 * 60;  // UTC-5
        _ctx->airportUtcOffsetMap["LHR"] = 0;        // UTC
        _ctx->airportUtcOffsetMap["CDG"] = 1 * 60;   // UTC+1

        _ctx->airportZoneIdMap["SIN"] = "Asia/Singapore";
        _ctx->airportZoneIdMap["JFK"] = "America/New_York";
        _ctx->airportZoneIdMap["MIA"] = "America/New_York";
        _ctx->airportZoneIdMap["FRA"] = "Europe/Berlin";
        _ctx->airportZoneIdMap["LHR"] = "Europe/London";
        _ctx->airportZoneIdMap["CDG"] = "Europe/Paris";

        setupAssignmentGroups(_ctx.get());

        auto& ln = RuleParams::GetInstancePtr()->getLocalNightDefinition();
        ln.LocalStart = "22:00";
        ln.LocalEnd = "06:00";
        ln.MinRestInterval = "08:00";

        RuleParams::GetInstancePtr()->setApplication(PAIRING_OPTIMIZER);

        _checker = std::make_unique<LegalityChecker>(PAIRING_OPTIMIZER, false);
        _checker->setDataContext(_ctx, -1, false);
    }
};

// --- Tests ------------------------------------------------------------------

TEST_F(Rule8015PairingTest, FirstDutyIsULR_PassAndFail) {
    // Test Case 1
    std::vector<DBRule> rules;
    DBRule rule8015_t1 = make8015Rule(1, 1, defaultDefinitionParams());
    DBRule rule8015_t2 = make8015Rule(2, 1, defaultPostDutyParams());
    rules.push_back(rule8015_t1);
    rules.push_back(rule8015_t2);
    parseRuleParams(rules, _ctx->rule_8014);
    for (const auto& r : rules) {
        _ctx->addRuleFunction(r.function, r);
    }
    std::vector<int> checkRules = {RULES::ULR_REST_CHECK};

    // Pass: post-ULR rest >= 48h
    {
        Duty* duty1 = makeDuty(
            {makeFlight("SIN",
                        "JFK",
                        utcFromString("2025-01-01 00:00:00"),
                        utcFromString("2025-01-01 18:00:00"),
                        "777")});
        Duty* duty2 = makeDuty(
            {makeFlight("JFK",
                        "SIN",
						utcFromString("2025-01-03 18:00:00"), // utc -5 = loc 13:00
                        utcFromString("2025-01-04 02:00:00"), 
                        "777")});
        std::unique_ptr<Pairing> pairing(makePairing({duty1, duty2}, "SIN"));

		// rest time from 2025-01-01 13:00:00 to 2025-01-03 13:00:00 = 48h, 2 local nights

        bool result = _checker->checkPGRules(pairing.get(), checkRules);
        EXPECT_TRUE(result);

        delete duty1;
        delete duty2;
    }

    // Fail: post-ULR rest < 48h
    {
        Duty* duty1 = makeDuty(
            {makeFlight("SIN",
                        "JFK",
                        utcFromString("2025-01-01 00:00:00"),
                        utcFromString("2025-01-01 18:00:00"),
                        "777")});
        Duty* duty2 = makeDuty(
            {makeFlight("JFK",
                        "FRA",
						utcFromString("2025-01-03 17:00:00"), // utc -5 = loc 12:00
                        utcFromString("2025-01-03 23:00:00"),
                        "777")});
        std::unique_ptr<Pairing> pairing(makePairing({duty1, duty2}, "SIN"));

        // rest time from 2025-01-01 13:00:00 to 2025-01-03 12:00:00 = 47h, 2 local nights

        bool result = _checker->checkPGRules(pairing.get(), checkRules);
        EXPECT_FALSE(result);

        delete duty1;
        delete duty2;
    }
}

TEST_F(Rule8015PairingTest, SecondDutyIsULR_PassAndFail) {
    // Test Case 2
    std::vector<DBRule> rules;
    DBRule rule8015_t1 = make8015Rule(1, 1, defaultDefinitionParams());
    DBRule rule8015_t2 = make8015Rule(2, 1, defaultPreDutyParams());
    rules.push_back(rule8015_t1);
    rules.push_back(rule8015_t2);
    parseRuleParams(rules, _ctx->rule_8014);
    for (const auto& r : rules) {
        _ctx->addRuleFunction(r.function, r);
    }
    std::vector<int> checkRules = {RULES::ULR_REST_CHECK};

    // Pass: pre-ULR rest >= 48h
    {
        Duty* duty1 = makeDuty(
            {makeFlight("SIN",
                        "FRA",
                        utcFromString("2025-02-01 00:00:00"),
						utcFromString("2025-02-01 08:00:00"), // utc +1 = loc 09:00
                        "777")});
        Duty* duty2 = makeDuty(
            {makeFlight("FRA",
                        "SIN",
                        utcFromString("2025-02-03 08:00:00"),
                        utcFromString("2025-02-04 02:00:00"),
                        "777")});
        std::unique_ptr<Pairing> pairing(makePairing({duty1, duty2}, "SIN"));

		// rest time from 2025-02-01 09:00:00 to 2025-02-03 09:00:00 = 48h, 1 local nights

        bool result = _checker->checkPGRules(pairing.get(), checkRules);
        EXPECT_TRUE(result);

        delete duty1;
        delete duty2;
    }

    // Fail: pre-ULR rest LN < 2
    {
        Duty* duty1 = makeDuty(
            {makeFlight("SIN",
                        "FRA",
                        utcFromString("2025-02-01 00:00:00"),
						utcFromString("2025-02-01 04:00:00"), // utc +1 = loc 05:00
                        "777")});
        Duty* duty2 = makeDuty(
            {makeFlight("FRA",
                        "SIN",
                        utcFromString("2025-02-03 04:00:00"),
                        utcFromString("2025-02-04 01:00:00"),
                        "777")});
        std::unique_ptr<Pairing> pairing(makePairing({duty1, duty2}, "SIN"));

		// rest time from 2025-02-01 05:00:00 to 2025-02-03 05:00:00 = 48h, 1 local nights

        bool result = _checker->checkPGRules(pairing.get(), checkRules);
        EXPECT_FALSE(result);

        delete duty1;
        delete duty2;
    }
}

TEST_F(Rule8015PairingTest, NoULRDuty_Pass) {
    // Test Case 3
    std::vector<DBRule> rules;
    DBRule rule8015_t1 = make8015Rule(1, 1, defaultDefinitionParams());
    DBRule rule8015_t2 = make8015Rule(2, 1, defaultPostDutyParams());
    rules.push_back(rule8015_t1);
    rules.push_back(rule8015_t2);
    parseRuleParams(rules, _ctx->rule_8014);
    for (const auto& r : rules) {
        _ctx->addRuleFunction(r.function, r);
    }
    std::vector<int> checkRules = {RULES::ULR_REST_CHECK};

    Duty* duty1 = makeDuty(
        {makeFlight("SIN",
                    "FRA",
                    utcFromString("2025-03-01 00:00:00"),
                    utcFromString("2025-03-01 08:00:00"),
                    "777")});
    Duty* duty2 = makeDuty(
        {makeFlight("FRA",
                    "SIN",
                    utcFromString("2025-03-02 00:00:00"),
                    utcFromString("2025-03-02 08:00:00"),
                    "777")});
    std::unique_ptr<Pairing> pairing(makePairing({duty1, duty2}, "SIN"));

	// No ULR duty, should pass directly
    bool result = _checker->checkPGRules(pairing.get(), checkRules);
    EXPECT_TRUE(result);

    delete duty1;
    delete duty2;
}

TEST_F(Rule8015PairingTest, ULRThenPositioning_Pass) {
    // Test Case 4
    auto params = defaultPostDutyParams();
    params["EXCEPTION ASSIGNMENT GROUPS"] = "MVP|SBY";

    std::vector<DBRule> rules;
    DBRule rule8015_t1 = make8015Rule(1, 1, defaultDefinitionParams());
    DBRule rule8015_t2 = make8015Rule(2, 1, params);
    rules.push_back(rule8015_t1);
    rules.push_back(rule8015_t2);
    parseRuleParams(rules, _ctx->rule_8014);
    for (const auto& r : rules) {
        _ctx->addRuleFunction(r.function, r);
    }
    std::vector<int> checkRules = {RULES::ULR_REST_CHECK};

    Duty* duty1 = makeDuty(
        {makeFlight("SIN",
                    "JFK",
                    utcFromString("2025-04-01 00:00:00"),
                    utcFromString("2025-04-01 18:00:00"),
                    "777")});
    Duty* duty2 = makeDuty(
        {makePositioning("JFK",
                         "SIN",
                         utcFromString("2025-04-02 04:00:00"),
                         utcFromString("2025-04-02 22:00:00"))});
    std::unique_ptr<Pairing> pairing(makePairing({duty1, duty2}, "SIN"));

	// rest time from 2025-04-01 13:00:00 to 2025-04-02 13:00:00 = 24h, but positioning is in exception assignment group
    bool result = _checker->checkPGRules(pairing.get(), checkRules);
    EXPECT_TRUE(result);

    delete duty1;
    delete duty2;
}

TEST_F(Rule8015PairingTest, ULRWithStandby_Fail) {
    // Test Case 5
    std::vector<DBRule> rules;
    DBRule rule8015_t1 = make8015Rule(1, 1, defaultDefinitionParams());
    DBRule rule8015_t2 = make8015Rule(2, 1, defaultPostDutyParams());
    rules.push_back(rule8015_t1);
    rules.push_back(rule8015_t2);
    parseRuleParams(rules, _ctx->rule_8014);
    for (const auto& r : rules) {
        _ctx->addRuleFunction(r.function, r);
    }
    std::vector<int> checkRules = {RULES::ULR_REST_CHECK};

    Duty* duty1 = makeDuty(
        {makeFlight("SIN",
                    "JFK",
                    utcFromString("2025-05-01 00:00:00"),
                    utcFromString("2025-05-01 18:00:00"),
                    "777")});
    Duty* duty2 = makeStandbyDuty(utcFromString("2025-05-02 04:00:00"),
                                  utcFromString("2025-05-02 08:00:00"),
                                  "JFK");
    Duty* duty3 = makeDuty(
        {makeFlight("JFK",
                    "SIN",
					utcFromString("2025-05-02 18:00:00"),   // utc -5 = loc 13:00
                    utcFromString("2025-05-03 02:00:00"),
                    "777")});
    std::unique_ptr<Pairing> pairing(makePairing({duty1, duty2, duty3}, "SIN"));

	// rest time from 2025-05-01 13:00:00 to 2025-05-02 13:00:00 = 24h, only 1 local night
    bool result = _checker->checkPGRules(pairing.get(), checkRules);
    EXPECT_FALSE(result);

    delete duty1;
    delete duty2;
    delete duty3;
}

TEST_F(Rule8015PairingTest, PreUlrRest_StandbyInMiddle_DoesNotReduceLocalNights) {
    auto params = defaultPreDutyParams();
    params["MIN REST LENGTH"] = "12:00";
    params["MIN CALENDAR DAYS"] = "0";
    params["MIN LOCAL NIGHTS"] = "1";
    params["EXCEPTION ASSIGNMENT GROUPS"] = "SBY";

    std::vector<DBRule> rules;
    DBRule rule8015_t1 = make8015Rule(1, 1, defaultDefinitionParams());
    DBRule rule8015_t2 = make8015Rule(2, 1, params);
    rules.push_back(rule8015_t1);
    rules.push_back(rule8015_t2);
    parseRuleParams(rules, _ctx->rule_8014);
    for (const auto& r : rules) {
        _ctx->addRuleFunction(r.function, r);
    }
    std::vector<int> checkRules = {RULES::ULR_REST_CHECK};

    Duty* duty1 = makeDuty(
        {makeFlight("LHR",
                    "JFK",
                    utcFromString("2025-05-01 18:00:00"),
                    utcFromString("2025-05-02 01:00:00"),
                    "777")});
    Duty* duty2 = makeStandbyDuty(utcFromString("2025-05-02 04:00:00"),
                                  utcFromString("2025-05-02 06:00:00"),
                                  "JFK");
    Duty* duty3 = makeDuty(
        {makeFlight("JFK",
                    "SIN",
                    utcFromString("2025-05-02 13:00:00"),  // JFK local 08:00
                    utcFromString("2025-05-03 07:00:00"),
                    "777")});
    std::unique_ptr<Pairing> pairing(makePairing({duty1, duty2, duty3}, "SIN"));

    // Rest is 12h (JFK local 20:00 -> 08:00) containing 1 local night, with a standby in the middle.
    bool result = _checker->checkPGRules(pairing.get(), checkRules);
    EXPECT_TRUE(result);

    delete duty1;
    delete duty2;
    delete duty3;
}

TEST_F(Rule8015PairingTest, EmptyTable1_Use7405_PassAndFail) {
    // Test Case 6
    std::map<std::string, std::string> rule7405_params = {
        {"DEP", "JFK"},
        {"ARR", "SIN"},
        {"Fleet", "*"},
        {"Fleet Group", "*"},
        {"Effective Date", "*"},
        {"Expiry Date", "*"},
    };

    std::vector<DBRule> rules;
    DBRule rule7405 = make7405Rule(1, rule7405_params);
    rules.push_back(rule7405);

    DBRule rule8015_t2 = make8015Rule(2, 1, defaultPostDutyParams());
    rules.push_back(rule8015_t2);

    parseRuleParams(rules, _ctx->rule_8014);
    _ctx->ruleList = rules;
    _checker->setDataContext(_ctx, -1, false);
    std::vector<int> checkRules = {RULES::ULR_REST_CHECK};

    // Pass: post-ULR rest >= 48h
    {
        Duty* duty1 = makeDuty(
            {makeFlight("JFK",
                        "SIN",
                        utcFromString("2025-06-01 18:00:00"), // utc -5 = loc 13:00
                        utcFromString("2025-06-02 02:00:00"), // utc +8 = loc 10:00
                        "777")});

        Duty* duty2 = makeDuty(
            {makeFlight("SIN",
                        "JFK",
                        utcFromString("2025-06-04 02:00:00"), // utc +8 = loc 10:00
                        utcFromString("2025-06-04 20:00:00"),
                        "777")});
        std::unique_ptr<Pairing> pairing(makePairing({duty1, duty2}, "SIN"));

		// rest time from 2025-06-02 10:00:00 (SIN local) to 2025-06-04 10:00:00 (SIN local) = 48h, 2 local nights
        bool result = _checker->checkPGRules(pairing.get(), checkRules);
        EXPECT_TRUE(result);

        delete duty1;
        delete duty2;
    }

    // Fail: post-ULR rest < 48h
    {
        Duty* duty1 = makeDuty(
            {makeFlight("JFK",
                        "SIN",
                        utcFromString("2025-06-01 18:00:00"), // utc -5 = loc 13:00
                        utcFromString("2025-06-02 02:00:00"), // utc +8 = loc 10:00
                        "777")});

        Duty* duty2 = makeDuty(
            {makeFlight("SIN",
                        "JFK",
                        utcFromString("2025-06-04 00:00:00"), // utc +8 = loc 08:00
                        utcFromString("2025-06-04 18:00:00"),
                        "777")});
        std::unique_ptr<Pairing> pairing(makePairing({duty1, duty2}, "SIN"));

		// rest time from 2025-06-02 10:00:00 (SIN local) to 2025-06-04 08:00:00 (SIN local) = 46h, 2 local nights, fail
        bool result = _checker->checkPGRules(pairing.get(), checkRules);
        EXPECT_FALSE(result);

        delete duty1;
        delete duty2;
    }
}

TEST_F(Rule8015PairingTest, EmptyTable1_Use7405_NoULR_Pass) {
    // Test Case 7
    std::map<std::string, std::string> rule7405_params = {
        {"DEP", "JFK"},
        {"ARR", "SIN"},
        {"Fleet", "*"},
        {"Fleet Group", "*"},
        {"Effective Date", "*"},
        {"Expiry Date", "*"},
    };

    std::vector<DBRule> rules;
    DBRule rule7405 = make7405Rule(1, rule7405_params);
    rules.push_back(rule7405);

    DBRule rule8015_t2 = make8015Rule(2, 1, defaultPostDutyParams());
    rules.push_back(rule8015_t2);

    parseRuleParams(rules, _ctx->rule_8014);
    _ctx->ruleList = rules;
    _checker->setDataContext(_ctx, -1, false);
    std::vector<int> checkRules = {RULES::ULR_REST_CHECK};

    Duty* duty1 = makeDuty(
        {makeFlight("MIA",
                    "LHR",
                    utcFromString("2025-07-01 00:00:00"),
					utcFromString("2025-07-01 08:00:00"), // utc +0 = loc 08:00
                    "777")});

    Duty* duty2 = makeDuty(
        {makeFlight("LHR",
                    "MIA",
					utcFromString("2025-07-01 18:00:00"), // utc +0 = loc 18:00
                    utcFromString("2025-07-01 19:00:00"),
                    "777")});
    std::unique_ptr<Pairing> pairing(makePairing({duty1, duty2}, "MIA"));

	// No ULR duty, should pass directly
    bool result = _checker->checkPGRules(pairing.get(), checkRules);
    EXPECT_TRUE(result);

    delete duty1;
    delete duty2;
}

}  // namespace
