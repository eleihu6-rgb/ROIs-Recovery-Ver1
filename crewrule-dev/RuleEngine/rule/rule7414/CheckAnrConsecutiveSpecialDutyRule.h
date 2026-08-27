/**
 * @file CheckAnrConsecutiveSpecialDutyRule.h
 */

#ifndef RULEENGINE_RULE7414_CHECKANRCONSECUTIVESPECIALDUTYRULE_H_
#define RULEENGINE_RULE7414_CHECKANRCONSECUTIVESPECIALDUTYRULE_H_

#include <vector>

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "AnrConsecutiveSpecialDutyRuleParam.h"

class CheckAnrConsecutiveSpecialDutyRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = RULES::ANR_CONSECUTIVE_SPECIAL_DUTY;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::SinglePairing | RuleInterface::Interface::SingleCrew;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit CheckAnrConsecutiveSpecialDutyRule(const RuleSystem* system,
                                                const InputType& input)
        : BasicRule(system, RuleFuncId, AvailableInterface),
          _param(this) {
        _param.ParseFromRuleInput(input);
    }
    ~CheckAnrConsecutiveSpecialDutyRule() override = default;

    bool CheckRule(const Pairing* pairing) const override;
    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:
    struct RestInfo {
        int minutes{0};
        int localNights{0};
        time_t startUtc{0};
        time_t endUtc{0};
        const Duty* prev{nullptr};
        const Duty* next{nullptr};
    };

    AnrConsecutiveSpecialDutyRuleParam _param;

    bool checkPairing(const Pairing* pairing, const ROSTER* roster) const;
    bool isSpecialDuty(const Duty* duty, bool includeTrailingDhd) const;
    RestInfo evaluateRest(const Duty* prevDuty,
                          const Duty* nextDuty,
                          const AnrConsecutiveSpecialDutyControlParam& control,
                          const std::vector<Duty*>& duties,
                          std::size_t prevIdx,
                          std::size_t nextIdx) const;
    bool restQualifies(const RestInfo& rest, const AnrConsecutiveSpecialDutyConfig& config) const;
    void throwViolation(const Pairing* pairing,
                        const ROSTER* roster,
                        const Duty* windowStart,
                        const Duty* windowEnd,
                        const RestInfo& bestRest,
                        const AnrConsecutiveSpecialDutyConfig& config) const;
};

#endif  // RULEENGINE_RULE7414_CHECKANRCONSECUTIVESPECIALDUTYRULE_H_
