/**
 * @file MinimumDaysOffForCARSRule.h
 * @brief Rule 7505 — minimum days off in rolling/fixed windows (logic aligned with rule 8023).
 */

#ifndef RULEENGINE_RULE7505_MINIMUMDAYSOFFFORCARSRULE_H_
#define RULEENGINE_RULE7505_MINIMUMDAYSOFFFORCARSRULE_H_

#include <vector>

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MinimumDaysOffForCARSRuleParam.h"

class MinimumDaysOffForCARSRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7505;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit MinimumDaysOffForCARSRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, MinimumDaysOffForCARSRule::RuleFuncId,
                    MinimumDaysOffForCARSRule::AvailableInterface) {
        ParseParam(input);
    }
    ~MinimumDaysOffForCARSRule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:
    std::vector<MinimumDaysOffForCARSRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    bool CheckRuleForCrew(const MinimumDaysOffForCARSRuleParam& anchor,
                          const SharedPtr<CREW>& crew,
                          const std::vector<SharedPtr<ROSTER>>& rosters,
                          time_t rollingWindowStart,
                          time_t rollingWindowEnd) const;

    void ThrowDaysOffShortViolation(const MinimumDaysOffForCARSRuleParam& ruleParam,
                                   time_t rangeStartUtc,
                                   time_t endExclusiveUtc,
                                   int iDaysOff,
                                   int offsetMinutes) const;

    void ThrowLastRosterEndViolation(const MinimumDaysOffForCARSRuleParam& ruleParam,
                                    time_t rangeStartUtc,
                                    time_t endExclusiveUtc,
                                    int offsetMinutes) const;
};

#endif  // RULEENGINE_RULE7505_MINIMUMDAYSOFFFORCARSRULE_H_
