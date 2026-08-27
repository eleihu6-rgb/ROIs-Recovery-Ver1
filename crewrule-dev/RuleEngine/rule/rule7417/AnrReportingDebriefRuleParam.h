#ifndef RULEENGINE_RULE7417_ANRREPORTINGDEBRIEFRULEPARAM_H_
#define RULEENGINE_RULE7417_ANRREPORTINGDEBRIEFRULEPARAM_H_

#include <string>
#include <vector>

#include "RuleParam.h"
#include "RuleInput.h"

class Duty;
class CrewDataContext;

struct AnrReportingDebriefConfig {
    long long idRule{0};
    long long idRuleParam{0};
    int rowNum{0};
    std::string overrideAbility;
    std::string description;
    std::string reference;

    std::string serviceTypeUpper{"*"};
    std::vector<std::string> fleetGroupsUpper{};
    std::vector<std::string> dutyAssignmentsUpper{};

    int minTotalMinutes{90};
    int minBriefMinutes{0};
};

class AnrReportingDebriefRuleParam : public RuleParam {
public:
    explicit AnrReportingDebriefRuleParam(const Rule* rule) : RuleParam(rule) {}

    void ParseFromRuleInput(const RuleInput& input);

    std::vector<const AnrReportingDebriefConfig*> findConfigsForDuty(
        const Duty* duty,
        const CrewDataContext* dbData) const;
    bool hasConfig() const { return _hasConfig; }

private:
    void parseDbRule(const DBRule& dbRule, AnrReportingDebriefConfig& configOut);
    static int parseMinutes(const std::string& value, int defaultValue);

    std::vector<AnrReportingDebriefConfig> _configs;
    bool _hasConfig{false};
};

#endif  // RULEENGINE_RULE7417_ANRREPORTINGDEBRIEFRULEPARAM_H_
