/**
 * @file CalculateAccStartAtBaseForRTRule.h
 * @brief Calculate acclimatization start state based on local nights for TG regulation 7024
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-12
**/

#ifndef _CALCULATEACCSTARTATBASEFORRTRULE_H_
#define _CALCULATEACCSTARTATBASEFORRTRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MinRestAtBaseForTGRuleParam.h"

class CalculateAccStartAtBaseForRTRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7024;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit CalculateAccStartAtBaseForRTRule(const RuleSystem* system, const InputType& input)
        : CalculateRule(system, CalculateAccStartAtBaseForRTRule::RuleFuncId, CalculateAccStartAtBaseForRTRule::AvailableInterface) {
        ParseParam(input);
    }

    ~CalculateAccStartAtBaseForRTRule() override = default;

    void CalculateDuty(Pairing* pairing) override;

    void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:
    std::vector<MinRestAtBaseForTGRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    bool CalculateDuty(Duty* lastDuty, const ROSTER* nextRoster, const int offsetTZMinutes, const MinRestAtBaseForTGRuleParam& ruleParam) const;
};

#endif //_CALCULATEACCSTARTATBASEFORRTRULE_H_
