/**
 * @file CheckAnrMaxFdpRule.h
 */

#ifndef _CHECK_ANR_MAX_FDP_RULE_H_
#define _CHECK_ANR_MAX_FDP_RULE_H_

#include <unordered_map>
#include <vector>
#include "../RuleInput.h"
#include "../BasicRule.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "AnrMaxFdpRuleParam.h"

class CheckAnrMaxFdpRule : public BasicRule, public MinimumLegalComplementCoverageRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7410;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::SingleDuty |
        RuleInterface::Interface::SingleCrew |
        RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

    explicit CheckAnrMaxFdpRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system,
                    CheckAnrMaxFdpRule::RuleFuncId,
                    CheckAnrMaxFdpRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckAnrMaxFdpRule() override = default;

    bool CheckRule(const Duty* duty) const override;
    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;
    MinimumLegalComplementCoverage getMinimumLegalComplementCoverage(const Duty* duty) const override;

 private:
    struct RuleInstance {
        long long ruleId{0};
        AnrMaxFdpRuleParam param;

        explicit RuleInstance(const Rule* rule, long long idRule)
            : ruleId(idRule), param(rule) {}
    };

    std::vector<RuleInstance> _ruleInstances;

    void ParseParam(const InputType& input);

    bool checkDutyInternal(const Duty* duty, const ROSTER* roster, const AnrMaxFdpRuleParam& param) const;
    void throwViolation(const Duty* duty,
                        const ROSTER* roster,
                        int currentFdpMinutes,
                        int maxFdpMinutes,
                        int bufferMinutes,
                        const AnrMaxFdpLimit& limit,
                        int sectors) const;
};

#endif // _CHECK_ANR_MAX_FDP_RULE_H_
