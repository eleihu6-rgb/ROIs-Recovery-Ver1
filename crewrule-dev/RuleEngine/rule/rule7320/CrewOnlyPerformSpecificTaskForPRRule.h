/**
 * @file CrewOnlyPerformSpecificTaskForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-10-15
**/

#ifndef _CREWONLYPERFORMSPECIFICTASKFORPRRULE_H_
#define _CREWONLYPERFORMSPECIFICTASKFORPRRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CrewOnlyPerformSpecificTaskForPRRuleParam.h"

class CrewOnlyPerformSpecificTaskForPRRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7320;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CrewOnlyPerformSpecificTaskForPRRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CrewOnlyPerformSpecificTaskForPRRule::RuleFuncId, CrewOnlyPerformSpecificTaskForPRRule::AvailableInterface) {
		ParseParam(input);
	}
	~CrewOnlyPerformSpecificTaskForPRRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<CrewOnlyPerformSpecificTaskForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const CrewOnlyPerformSpecificTaskForPRRuleParam& ruleParam) const;

private:
	//Crew是否能执行地面任务，true：能执行，false：不能执行
	bool CanOperate(const ROSTER* roster, const CrewOnlyPerformSpecificTaskForPRRuleParam& ruleParam) const;

	//Crew是否能执行航班任务，true：能执行，false：不能执行
	bool CanOperate(const ROSTER* roster, const Segment* segment, const CrewOnlyPerformSpecificTaskForPRRuleParam& ruleParam) const;

	void ThrowRuleViolationForFlight(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const Segment* segment, const CrewOnlyPerformSpecificTaskForPRRuleParam& ruleParam) const;

	void ThrowRuleViolationForGroundRoster(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const CrewOnlyPerformSpecificTaskForPRRuleParam& ruleParam) const;

};

#endif //_CREWONLYPERFORMSPECIFICTASKFORPRRULE_H_
