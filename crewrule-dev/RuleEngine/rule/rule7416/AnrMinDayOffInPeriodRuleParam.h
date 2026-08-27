#ifndef RULEENGINE_RULE7416_ANRMINDAYOFFINPERIODRULEPARAM_H_
#define RULEENGINE_RULE7416_ANRMINDAYOFFINPERIODRULEPARAM_H_

#include <string>
#include <vector>

#include "RuleParam.h"
#include "RuleInput.h"

class CrewDataContext;
class Pairing;

struct AnrMinDayOffInPeriodConfig {
    long long idRule{0};
    long long idRuleParam{0};
    int rowNum{0};
    std::string overrideAbility;
    std::string description;
    std::string reference;

    std::string serviceTypeUpper{"*"};
    std::vector<std::string> fleetGroupsUpper{};

    std::string unit{"CW"};
    int period{2};
    int minDaysOff{2};
    int weekStartOn{1}; // 1=Mon, 0 or 7=Sun
};

class AnrMinDayOffInPeriodRuleParam : public RuleParam {
public:
    explicit AnrMinDayOffInPeriodRuleParam(const Rule* rule) : RuleParam(rule) {}

    void ParseFromRuleInput(const RuleInput& input);

    std::vector<const AnrMinDayOffInPeriodConfig*> findConfigsForPairing(
        const Pairing* pairing,
        const CrewDataContext* dbData) const;
    bool hasConfig() const { return _hasConfig; }

private:
    void parseDbRule(const DBRule& dbRule, AnrMinDayOffInPeriodConfig& configOut);

    std::vector<AnrMinDayOffInPeriodConfig> _configs;
    bool _hasConfig{false};
};

#endif  // RULEENGINE_RULE7416_ANRMINDAYOFFINPERIODRULEPARAM_H_
