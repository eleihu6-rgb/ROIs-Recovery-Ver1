/**
 * @file AcclimatizationOfANRRule.h
 */

#ifndef _ACCLIMATIZATION_OF_ANR_RULE_H_
#define _ACCLIMATIZATION_OF_ANR_RULE_H_

#include <string>
#include <vector>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "AcclimatizationOfANRRuleParam.h"

class AcclimatizationOfANRRule : public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7400;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit AcclimatizationOfANRRule(const RuleSystem* system, const InputType& input)
        : CalculateRule(system, AcclimatizationOfANRRule::RuleFuncId, AcclimatizationOfANRRule::AvailableInterface) {
        ParseParam(input);
    }
    ~AcclimatizationOfANRRule() override = default;

    void CalculateDuty(Pairing* pairing) override;
    void CalculateDuty(Duty* duty) override;
    void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:
    std::vector<AcclimatizationOfANRRuleParam> _ruleParams;

    void ParseParam(const InputType& input);
    void CalculateDuty(const std::vector<Duty*>& duties);

    static std::vector<time_t> GetRestLocalNightDates(const Duty* prevDuty, const Duty* currDuty,
        int restStartOffsetMinutes, int restEndOffsetMinutes, const std::string& restZoneId);
};

#endif // _ACCLIMATIZATION_OF_ANR_RULE_H_

