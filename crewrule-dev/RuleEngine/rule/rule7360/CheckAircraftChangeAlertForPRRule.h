/**
 * @file CheckAircraftChangeAlertForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-02-10
**/

#ifndef _CHECKAIRCRAFTCHANGEALERTFORPRRULE_H_
#define _CHECKAIRCRAFTCHANGEALERTFORPRRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckAircraftChangeAlertForPRRuleParam.h"

class CheckAircraftChangeAlertForPRRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7360;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CheckAircraftChangeAlertForPRRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckAircraftChangeAlertForPRRule::RuleFuncId, CheckAircraftChangeAlertForPRRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckAircraftChangeAlertForPRRule() override = default;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const Duty* duty) const override;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<CheckAircraftChangeAlertForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);
	
	bool CheckRule(const vector<Segment*>& segments, const CheckAircraftChangeAlertForPRRuleParam& ruleParam) const;

private:

	//获得Base变更前后的Roster，返回map<新基地, tuple<原基地最后一个Roster,新基地第一个Roster)>
	map<string, std::tuple<std::shared_ptr<ROSTER>, std::shared_ptr<ROSTER>>> GetRosterAfterBaseChange(const std::shared_ptr<CREW>& crew, const time_t checkedStartTime, const time_t checkedEndTime, const CheckAircraftChangeAlertForPRRuleParam& ruleParam) const;

	void ThrowRuleViolation(const Segment* currentSegment, const Segment* nextSegment, const CheckAircraftChangeAlertForPRRuleParam& ruleParam) const;

};

#endif //_CHECKAIRCRAFTCHANGEALERTFORPRRULE_H_
