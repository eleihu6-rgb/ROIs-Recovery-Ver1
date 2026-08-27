/**
 * @file AnrConsecutiveSpecialDutyRuleParam.h
 */

#ifndef RULEENGINE_RULE7414_ANRCONSECUTIVESPECIALDUTYRULEPARAM_H_
#define RULEENGINE_RULE7414_ANRCONSECUTIVESPECIALDUTYRULEPARAM_H_

#include <vector>
#include <string>

#include "RuleInput.h"
#include "RuleParam.h"

enum class AnrConsecutiveSpecialDutyRestType {
    IN,
    PRE,
    POST,
    UNKNOWN
};

struct AnrConsecutiveSpecialDutyConfig {
    long long idRule{RULES::ANR_CONSECUTIVE_SPECIAL_DUTY};
    long long idRuleParam{0};
    int rowNum{0};
    std::string overrideAbility;
    std::string description;
    std::string reference;
    bool includeTrailingDeadhead{true};
    AnrConsecutiveSpecialDutyRestType restType{AnrConsecutiveSpecialDutyRestType::IN};
    std::string restTypeLabel{"IN"};
    int numConsecutiveDuties{3};
    int minRestMinutes{24 * 60};
    int minLocalNights{1}; // -1 means ignore local night check
};

struct AnrConsecutiveSpecialDutyControlParam {
    // If non-empty, duties with assignments in this list are ignored as consecutive-duty boundaries.
    std::vector<std::string> ignoreIntermediateAssignmentsUpper{};

    // If true, all ignored intermediate duties reduce effective rest minutes and local nights.
    bool reduceAllIntermediateAssignments{false};
    // Otherwise, only intermediate duties with assignments in this list reduce effective rest and local night.
    std::vector<std::string> reduceRestAndLocalNightAssignmentsUpper{};
};

struct AnrConsecutiveSpecialDutyRuleInstance {
    long long ruleId{RULES::ANR_CONSECUTIVE_SPECIAL_DUTY};
    std::vector<AnrConsecutiveSpecialDutyConfig> configs{};
    AnrConsecutiveSpecialDutyControlParam control{};
};

class AnrConsecutiveSpecialDutyRuleParam : public RuleParam {
public:
    explicit AnrConsecutiveSpecialDutyRuleParam(const Rule* rule) : RuleParam(rule) {}

    void ParseFromRuleInput(const RuleInput& input);

    const std::vector<AnrConsecutiveSpecialDutyRuleInstance>& getInstances() const { return _instances; }
    bool hasConfig() const { return !_instances.empty(); }

private:
    static AnrConsecutiveSpecialDutyConfig parseDbRule(const DBRule& dbRule);
    static void parseControlRow(const DBRule& dbRule, AnrConsecutiveSpecialDutyControlParam& control);
    static AnrConsecutiveSpecialDutyRestType parseRestType(const std::string& value,
                                                           std::string& label);
    static int parseMinutes(const std::string& value, int defaultValue);
    static int parseIntValue(const std::string& value, int defaultValue);

    std::vector<AnrConsecutiveSpecialDutyRuleInstance> _instances;
};

#endif  // RULEENGINE_RULE7414_ANRCONSECUTIVESPECIALDUTYRULEPARAM_H_
