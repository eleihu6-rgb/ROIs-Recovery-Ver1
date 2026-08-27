#ifndef RULEENGINE_RULE7415_ANRDAYOFFSPACINGRULEPARAM_H_
#define RULEENGINE_RULE7415_ANRDAYOFFSPACINGRULEPARAM_H_

#include <string>
#include <vector>

#include "RuleParam.h"
#include "RuleInput.h"

class CrewDataContext;
class Pairing;

enum class Anr7415WorkDayEndsAt {
    Transport,  // duty end + dropoff
    Debrief     // duty debrief end
};

struct AnrDayOffSpacingConfig {
    long long idRule{0};
    long long idRuleParam{0};
    int rowNum{0};
    std::string overrideAbility;
    std::string description;
    std::string reference;
    std::string serviceTypeUpper{"*"};
    std::vector<std::string> fleetGroupsUpper{};
    int maxWorkingDays{7};
    int lastDayBufferMinutes{21 * 60};  // minutes from midnight
    Anr7415WorkDayEndsAt workDayEndsAt{Anr7415WorkDayEndsAt::Transport};
};

class AnrDayOffSpacingRuleParam : public RuleParam {
public:
    explicit AnrDayOffSpacingRuleParam(const Rule* rule) : RuleParam(rule) {}

    void ParseFromRuleInput(const RuleInput& input);

    std::vector<const AnrDayOffSpacingConfig*> findConfigsForPairing(
        const Pairing* pairing,
        const CrewDataContext* dbData) const;
    bool hasConfig() const { return _hasConfig; }

private:
    void parseDbRule(const DBRule& dbRule, AnrDayOffSpacingConfig& configOut);
    static int parseMinutes(const std::string& value, int defaultValue);

    std::vector<AnrDayOffSpacingConfig> _configs;
    bool _hasConfig{false};
};

#endif  // RULEENGINE_RULE7415_ANRDAYOFFSPACINGRULEPARAM_H_
