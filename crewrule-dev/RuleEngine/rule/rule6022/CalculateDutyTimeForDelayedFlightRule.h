/**
 * @file CalculateDutyTimeForDelayedFlightRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CALCULATEDUTYTIMEFORDELAYEDFLIGHTRULE_H_
#define _CALCULATEDUTYTIMEFORDELAYEDFLIGHTRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateDutyTimeForDelayedFlightRuleParam.h"

class CalculateDutyTimeForDelayedFlightRule : public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6022;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty;
    constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

    explicit CalculateDutyTimeForDelayedFlightRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateDutyTimeForDelayedFlightRule::RuleFuncId, CalculateDutyTimeForDelayedFlightRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CalculateDutyTimeForDelayedFlightRule() override = default;

	void CalculateDuty(Duty *duty) override;

	void CalculateDuty(Pairing* pairing) override;
private:

    std::vector<CalculateDutyTimeForDelayedFlightRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(const vector<Duty*>& duties);

	bool CalculateDuty(Duty* duty, const std::string& base, const CalculateDutyTimeForDelayedFlightRuleParam& ruleParam);

    void fixPairingAndDutyTime(Duty* duty, shared_ptr<PairingDutyNode> brief, shared_ptr<PairingDutyNode> pickup);

};





#endif //_CALCULATEDUTYTIMEFORDELAYEDFLIGHTRULE_H_
