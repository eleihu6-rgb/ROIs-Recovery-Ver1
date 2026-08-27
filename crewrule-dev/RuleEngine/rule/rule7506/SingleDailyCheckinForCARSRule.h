/**
 * @file SingleDailyCheckinForCARSRule.h
 * @brief Rule 7506 — at most one roster start per local day (logic derived from rule 8048).
 */

#ifndef RULEENGINE_RULE7506_SINGLEDAILYCHECKINFORCARSRULE_H_
#define RULEENGINE_RULE7506_SINGLEDAILYCHECKINFORCARSRULE_H_

#include <vector>

#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "SingleDailyCheckinForCARSRuleParam.h"

class SingleDailyCheckinForCARSRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7506;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface =
        RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit SingleDailyCheckinForCARSRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, SingleDailyCheckinForCARSRule::RuleFuncId,
                    SingleDailyCheckinForCARSRule::AvailableInterface) {
        ParseParam(input);
    }
    ~SingleDailyCheckinForCARSRule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:
    std::vector<SingleDailyCheckinForCARSRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    bool CheckRuleForCrew(const SingleDailyCheckinForCARSRuleParam& ruleParam,
                          const SharedPtr<CREW>& crew,
                          const std::vector<SharedPtr<ROSTER>>& rosters) const;

    void ThrowViolation(const SingleDailyCheckinForCARSRuleParam& ruleParam,
                        const ROSTER* prevRoster,
                        const ROSTER* currRoster,
                        time_t localDayStartUtc) const;
};

#endif  // RULEENGINE_RULE7506_SINGLEDAILYCHECKINFORCARSRULE_H_
