/**
 * @file CalculateAnrMaxFdpRule.h
 */

#ifndef _CALCULATE_ANR_MAX_FDP_RULE_H_
#define _CALCULATE_ANR_MAX_FDP_RULE_H_

#include <unordered_map>
#include <vector>
#include "../RuleInput.h"
#include "../CalculateRule.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "AnrMaxFdpRuleParam.h"

class CalculateAnrMaxFdpRule : public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7410;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::SingleDuty |
        RuleInterface::Interface::SingleCrew |
        RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

    explicit CalculateAnrMaxFdpRule(const RuleSystem* system, const InputType& input)
        : CalculateRule(system,
                        CalculateAnrMaxFdpRule::RuleFuncId,
                        CalculateAnrMaxFdpRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CalculateAnrMaxFdpRule() override = default;

    void CalculateDuty(Duty* duty) override;
    void CalculateDuty(Pairing* pairing) override;
    void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

 private:
    struct RuleInstance {
        long long ruleId{0};
        AnrMaxFdpRuleParam param;

        explicit RuleInstance(const Rule* rule, long long idRule)
            : ruleId(idRule), param(rule) {}
    };

    std::vector<RuleInstance> _ruleInstances;

    void ParseParam(const InputType& input);

    void calculateDutyInternal(Duty* duty);
};

#endif // _CALCULATE_ANR_MAX_FDP_RULE_H_
