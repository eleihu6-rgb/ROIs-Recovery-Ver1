#include <gtest/gtest.h>

#include <cstdlib>
#include <filesystem>
#include <memory>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleEngine/RuleEngine.h"
#include "TimezoneUtils.h"
#include "UtilFunc.h"

namespace {

constexpr const char* kDefaultRoInputDir = "/home/qiang/Crew/RO-Dev/generalro/build";

void ensureTimezoneDatabase() {
    static bool loaded = false;
    if (loaded) {
        return;
    }
    const std::vector<std::filesystem::path> candidates = {
        std::filesystem::path(kDefaultRoInputDir) / ".." / "orUtil" / "TimeZoneUtil" / "tzdata",
        std::filesystem::path(kDefaultRoInputDir) / ".." / ".." / "orUtil" / "TimeZoneUtil" / "tzdata",
    };
    for (const auto& path : candidates) {
        if (std::filesystem::exists(path)) {
            TimezoneUtils::SetTimezoneDatabase(path.lexically_normal().string());
            loaded = true;
            return;
        }
    }
}

std::string resolveRoInputDir() {
    if (const char* env = std::getenv("RO_INPUT_DIR")) {
        return env;
    }
    return kDefaultRoInputDir;
}

std::shared_ptr<CrewDataContext> loadRoInputFromBuildDir() {
    const std::string roInputDir = resolveRoInputDir();
    const auto previousCwd = std::filesystem::current_path();
    std::filesystem::current_path(roInputDir);

    auto dbData = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    dbData->configDataSource = "FILE";
    const int ret = dbData->loadData(110);
    std::filesystem::current_path(previousCwd);

    if (ret != 0) {
        return nullptr;
    }
    return dbData;
}

int findCrewIndex(const std::shared_ptr<CrewDataContext>& dbData, const std::string& crewId) {
    for (std::size_t i = 0; i < dbData->crewList.size(); ++i) {
        if (dbData->crewList[i]->idCrew == crewId) {
            return static_cast<int>(i);
        }
    }
    return -1;
}

}  // namespace

class Crew2227RoInput7504Test : public ::testing::Test {
protected:
    void SetUp() override {
        ensureTimezoneDatabase();
        dbData = loadRoInputFromBuildDir();
        ASSERT_NE(dbData, nullptr) << "Failed to load ro_input.txt from " << resolveRoInputDir();

        crewIndex = findCrewIndex(dbData, "2227");
        ASSERT_GE(crewIndex, 0) << "Crew 2227 not found in ro_input.txt";

        checker = std::make_unique<LegalityChecker>(ROSTER_EDITOR, false);
        checker->setDataContext(dbData);
    }

    std::shared_ptr<CrewDataContext> dbData;
    std::unique_ptr<LegalityChecker> checker;
    int crewIndex = -1;
};

TEST_F(Crew2227RoInput7504Test, FullCrewLegalityFlags7504Illegal) {
    const bool legal = checker->checkRules(crewIndex);
    const auto violations = checker->getRuleViolations();

    std::vector<const RULE_VIOLATION*> rule7504Violations;
    for (const auto* violation : violations) {
        if (violation == nullptr) {
            continue;
        }
        if (violation->idRule / 1000 == 7504 || violation->description.find("7504") != std::string::npos ||
            violation->violation_msg.find("minumum rest") != std::string::npos ||
            violation->violation_msg.find("minimum rest") != std::string::npos) {
            rule7504Violations.push_back(violation);
        }
    }

    std::cout << "crew 2227 full checkRules legal=" << (legal ? "true" : "false")
              << " total_violations=" << violations.size()
              << " rule7504_violations=" << rule7504Violations.size() << std::endl;
    for (const auto* violation : rule7504Violations) {
        std::cout << "  7504 violation: ruleId=" << violation->idRule << " msg=" << violation->violation_msg
                  << std::endl;
    }

    EXPECT_FALSE(rule7504Violations.empty()) << "Expected at least one rule 7504 violation for crew 2227";
}

TEST_F(Crew2227RoInput7504Test, Direct7504CheckRecordsViolations) {
    RULE_LEGALITY legality{};
    legality.crewIndex = crewIndex;
    legality.isLegal = true;
    checker->setApplication(ROSTER_EDITOR);

    const bool ruleReturn = checker->checkMinSpaceBetweenDutyForF8(&legality);
    const auto violations = checker->getRuleViolations();

    std::size_t rule7504Count = 0;
    for (const auto* violation : violations) {
        if (violation != nullptr && violation->idRule / 1000 == 7504) {
            ++rule7504Count;
            std::cout << "  7504 violation: " << violation->violation_msg << std::endl;
        }
    }

    std::cout << "crew 2227 direct checkMinSpaceBetweenDutyForF8 return=" << (ruleReturn ? "true" : "false")
              << " rule7504_violations=" << rule7504Count << std::endl;

    EXPECT_GE(rule7504Count, 1u) << "Direct rule 7504 should record violations for crew 2227";
}
