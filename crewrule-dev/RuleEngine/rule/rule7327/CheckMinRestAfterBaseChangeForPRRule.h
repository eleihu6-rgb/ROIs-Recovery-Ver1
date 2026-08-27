/**
 * @file CheckMinRestAfterBaseChangeForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-27
**/



#ifndef _CHECKMINRESTAFTERBASECHANGEFORPRRULE_H_
#define _CHECKMINRESTAFTERBASECHANGEFORPRRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckMinRestAfterBaseChangeForPRRuleParam.h"

class CheckMinRestAfterBaseChangeForPRRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7327;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CheckMinRestAfterBaseChangeForPRRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMinRestAfterBaseChangeForPRRule::RuleFuncId, CheckMinRestAfterBaseChangeForPRRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckMinRestAfterBaseChangeForPRRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<CheckMinRestAfterBaseChangeForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const map<string, std::tuple<std::shared_ptr<ROSTER>, time_t, std::shared_ptr<ROSTER>>>& rosterAfterBaseChangeMap, const CheckMinRestAfterBaseChangeForPRRuleParam& ruleParam) const;

private:

	//获得Base变更前后的Roster，返回map<新基地, tuple<原基地最后一个Roster,更换基地时间点, 新基地第一个Roster)>
	map<string, std::tuple<std::shared_ptr<ROSTER>, time_t, std::shared_ptr<ROSTER>>> GetRosterAfterBaseChange(const std::shared_ptr<CREW>& crew, const time_t checkedStartTime, const time_t checkedEndTime, const CheckMinRestAfterBaseChangeForPRRuleParam& ruleParam) const;

	void ThrowRuleViolationForMinRest(const time_t changeBaseUtc, const ROSTER* afterRoster, const CheckMinRestAfterBaseChangeForPRRuleParam& ruleParam) const;

	void ThrowRuleViolationForLocalNight(const time_t changeBaseUtc, const ROSTER* afterRoster, const CheckMinRestAfterBaseChangeForPRRuleParam& ruleParam) const;

};

#endif //_CHECKMINRESTAFTERBASECHANGEFORPRRULE_H_
