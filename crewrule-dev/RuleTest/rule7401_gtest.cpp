#include <gtest/gtest.h>

#include <string>
#include <vector>

#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"
#include "rule/rule7401/AnrDayOffDefinition.h"

namespace {

DBRule makeDayOffRow(int rowNum,
                     const std::string& sequence,
                     const std::string& minRest,
                     int minLocalNights) {
    DBRule row{};
    row.idRule = 7401001;
    row.function = 7401;
    row.tableNum = 1;
    row.rowNum = rowNum;
    row.severity = 2;
    row.overridebility = "S";
    row.reference = "ANR-121";
    row.idRuleParam = 208174010 + rowNum;

    row.params["Day Off Sequence"] = sequence;
    row.params["Min Rest Time"] = minRest;
    row.params["Min Local Nights"] = std::to_string(minLocalNights);

    return row;
}

time_t utcFromString(const std::string& s) {
    return utcStrToUtc(const_cast<char*>(s.c_str()));
}

void setDefaultLocalNight() {
    auto& ln = RuleParams::GetInstancePtr()->getLocalNightDefinition();
    ln.LocalStart = "22:00";
    ln.LocalEnd = "08:00";
    ln.MinRestInterval = "08:00";
}

AnrDayOffDefinition makeDefaultDefinition() {
    AnrDayOffDefinition def;
    return def;
}

}  // namespace

TEST(AnrDayOffDefinitionTest, ParseCustomDbRows) {
    std::vector<DBRule> rows;
    rows.push_back(makeDayOffRow(1, "1", "34:00", 1));
    rows.push_back(makeDayOffRow(2, "2-99", "24", 1));

    AnrDayOffDefinition def;
    def.loadFromDbRules(rows);

    ASSERT_EQ(2u, def.rows().size());
    const auto* first = def.findRequirementForSequence(1);
    ASSERT_NE(nullptr, first);
    EXPECT_EQ(34 * 60, first->minRestMinutes);
    EXPECT_EQ(1, first->minLocalNights);

    const auto* later = def.findRequirementForSequence(5);
    ASSERT_NE(nullptr, later);
    EXPECT_EQ(24 * 60, later->minRestMinutes);
    EXPECT_EQ(1, later->minLocalNights);
}

TEST(AnrDayOffDefinitionTest, ParseCustomDbRows2) {
    std::vector<DBRule> rows;
    rows.push_back(makeDayOffRow(1, "1", "34:00", 1));
    rows.push_back(makeDayOffRow(2, "2-99", "*", 1));

    AnrDayOffDefinition def;
    def.loadFromDbRules(rows);

    ASSERT_EQ(2u, def.rows().size());
    const auto* first = def.findRequirementForSequence(1);
    ASSERT_NE(nullptr, first);
    EXPECT_EQ(34 * 60, first->minRestMinutes);
    EXPECT_EQ(1, first->minLocalNights);

    const auto* later = def.findRequirementForSequence(5);
    ASSERT_NE(nullptr, later);
    EXPECT_EQ(0, later->minRestMinutes);
    EXPECT_EQ(1, later->minLocalNights);
}

TEST(AnrDayOffDefinitionTest, DefaultsAppliedWhenNoDbRows) {

    AnrDayOffDefinition def;

    ASSERT_FALSE(def.empty());
    const auto* first = def.findRequirementForSequence(1);
    ASSERT_NE(nullptr, first);
    EXPECT_EQ(34 * 60, first->minRestMinutes);
    EXPECT_EQ(1, first->minLocalNights);

    const auto* later = def.findRequirementForSequence(3);
    ASSERT_NE(nullptr, later);
    EXPECT_EQ(24 * 60, later->minRestMinutes);
    EXPECT_EQ(1, later->minLocalNights);
}

class AnrDayOffDefinitionCountTest : public ::testing::Test {
protected:
    void SetUp() override {
        setDefaultLocalNight();
    }
};

TEST_F(AnrDayOffDefinitionCountTest, CountsSingleDayOffWhenRestMeetsThreshold) {
    auto def = makeDefaultDefinition();
    const time_t restStart = utcFromString("2025-01-01 08:00:00");
    const time_t restEnd = restStart + 36 * 3600;  // 36h rest ends 20pm next day covers 34h + 1 local night

    EXPECT_EQ(1, def.countDaysOffInRest(restStart, restEnd, 0));
}

TEST_F(AnrDayOffDefinitionCountTest, CountsTwoDayOffsWhenRestHasTwoNights) {
    auto def = makeDefaultDefinition();
    const time_t restStart = utcFromString("2025-02-01 08:00:00");
    const time_t restEnd = restStart + 60 * 3600;  // 60h rest ends 20pm day+2 allows 34h + 24h with nights in each block

    EXPECT_EQ(2, def.countDaysOffInRest(restStart, restEnd, 0));
}

TEST_F(AnrDayOffDefinitionCountTest, CountsTwoDayOffsWhenRestHasTwoNights2) {
    std::vector<DBRule> rows;
    rows.push_back(makeDayOffRow(1, "1", "34:00", 1));
    rows.push_back(makeDayOffRow(2, "2-99", "*", 1));

    AnrDayOffDefinition def;
    def.loadFromDbRules(rows);

    const time_t restStart = utcFromString("2025-02-01 08:00:00");
    const time_t restEnd = restStart + 60 * 3600;  // 60h rest ends 20pm day+2 allows 34h + 24h with nights in each block

    EXPECT_EQ(2, def.countDaysOffInRest(restStart, restEnd, 0));
}

TEST_F(AnrDayOffDefinitionCountTest, StopsWhenNextBlockLacksLocalNight) {
    auto def = makeDefaultDefinition();
    // Rest starts at 2025-03-01 16:00 local (+8) and ends 58h later at 2025-03-04 02:00 local; 
    // first day off: local night 2025-03-01 22pm - 6am next day, rest ends after 34 hours at 2025-03-03 2am 
    // second day off counts from 2025-03-03 2am - 2025-03-04 2am: 24h block has no full local night.
    const time_t restStartUtc = utcFromString("2025-03-01 08:00:00");
    const time_t restEndUtc = restStartUtc + 58 * 3600;

    EXPECT_EQ(1, def.countDaysOffInRest(restStartUtc, restEndUtc, 480));
}
