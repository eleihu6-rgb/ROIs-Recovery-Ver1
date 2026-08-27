/**
 * @file CheckMinNumCrewRankRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKMINNUMCREWRANKRULE_H_
#define _CHECKMINNUMCREWRANKRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMinNumCrewRankRuleParam.h"
#include "../period/WorkPeriod.h"
#include "../period/RestPeriod.h"

class CheckMinNumCrewRankRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6039;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckMinNumCrewRankRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMinNumCrewRankRule::RuleFuncId, CheckMinNumCrewRankRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckMinNumCrewRankRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;
private:

	std::vector<CheckMinNumCrewRankRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const Pairing* pairing, const std::shared_ptr<CREW>& crew, const CheckMinNumCrewRankRuleParam& ruleParam) const;

    bool CheckRule(const Segment* segment, const CheckMinNumCrewRankRuleParam& ruleParam) const;

	void ThrowRuleViolation(const Duty* duty, const Segment* segment) const;

};




#endif //_CHECKMINNUMCREWRANKRULE_H_
