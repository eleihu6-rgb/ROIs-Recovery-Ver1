/**
 * @file LimitFleetForStandbyRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITFLEETFORSTANDBYRULE_H_
#define _LIMITFLEETFORSTANDBYRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitFleetForStandbyRuleParam.h"
#include "../period/WorkPeriod.h"
#include "../period/RestPeriod.h"

class LimitFleetForStandbyRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6026;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty;
    constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

    explicit LimitFleetForStandbyRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitFleetForStandbyRule::RuleFuncId, LimitFleetForStandbyRule::AvailableInterface) {
        ParseParam(input);
    }
    ~LimitFleetForStandbyRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;
private:

	std::vector<LimitFleetForStandbyRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const LimitFleetForStandbyRuleParam& ruleParam) const;

	void ThrowRuleViolation(const std::shared_ptr<CREW>& crew, const Pairing* pairing, const Segment* segment) const;


};




#endif //_LIMITFLEETFORSTANDBYRULE_H_
