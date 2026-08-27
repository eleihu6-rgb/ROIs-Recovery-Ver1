#include <gtest/gtest.h>

#include "CrewDB.h"
#include "ruletest.h"

#include <memory>
#include <string>

#ifndef RULETEST_DATA_DIR
#define RULETEST_DATA_DIR ""
#endif

bool utility_test();

std::unique_ptr<LegalityChecker> ruletest_init() {
    auto dbData = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    std::string scenarioPath = RULETEST_DATA_DIR;
    if (scenarioPath.empty()) {
        scenarioPath = "scenario_input.csv";
    } else {
        const char tail = scenarioPath.back();
        if (tail != '/' && tail != '\\') {
            scenarioPath.push_back('/');
        }
        scenarioPath += "scenario_input.csv";
    }
    dbData->loadDataCsv(scenarioPath.c_str());
    auto ruleEngine = std::make_unique<LegalityChecker>();
    ruleEngine->setDataContext(dbData);
    return ruleEngine;
}

TEST(RuleRegressionTest, FdpScenariosStayLegal) {
    auto engine = ruletest_init();
    ASSERT_NE(engine, nullptr);
    EXPECT_TRUE(test_rule_fdp(*engine));
}

TEST(RuleRegressionTest, Rule8115MatchesExpectations) {
    auto engine = ruletest_init();
    ASSERT_NE(engine, nullptr);
    EXPECT_TRUE(test_rule_8115(*engine));
}

TEST(RuleRegressionTest, Rule2003CasesMatchExpectations) {
    auto engine = ruletest_init();
    ASSERT_NE(engine, nullptr);
    EXPECT_TRUE(test_rule_2003(*engine));
}

TEST(RuleRegressionTest, Rule2124CasesMatchExpectations) {
    auto engine = ruletest_init();
    ASSERT_NE(engine, nullptr);
    EXPECT_TRUE(test_rule_2124(*engine));
}

TEST(UtilityTest, OffsetHelpers) {
    EXPECT_TRUE(utility_test());
}

int main(int argc, char** argv) {
    ::testing::InitGoogleTest(&argc, argv);
    return RUN_ALL_TESTS();
}
