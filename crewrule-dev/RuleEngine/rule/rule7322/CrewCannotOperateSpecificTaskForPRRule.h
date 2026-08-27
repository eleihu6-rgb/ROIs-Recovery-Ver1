/**
 * @file CrewCannotOperateSpecificTaskForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-10-15
**/

#ifndef _CREWCANNOTOPERATESPECIFICTASKFORPRRULE_H_
#define _CREWCANNOTOPERATESPECIFICTASKFORPRRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CrewCannotOperateSpecificTaskForPRRuleParam.h"

class CrewCannotOperateSpecificTaskForPRRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7322;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit CrewCannotOperateSpecificTaskForPRRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CrewCannotOperateSpecificTaskForPRRule::RuleFuncId, CrewCannotOperateSpecificTaskForPRRule::AvailableInterface) {
		ParseParam(input);
	}
	~CrewCannotOperateSpecificTaskForPRRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<CrewCannotOperateSpecificTaskForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const CrewCannotOperateSpecificTaskForPRRuleParam& ruleParam) const;

private:

	bool CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const CrewCannotOperateSpecificTaskForPRRuleParam& ruleParam) const;

	//Crew是否能执行地面任务，true：能执行，false：不能执行
	bool CanOperate(const ROSTER* roster, const CrewCannotOperateSpecificTaskForPRRuleParam& ruleParam) const;

	//Crew是否能执行航班任务，true：能执行，false：不能执行
	bool CanOperate(const ROSTER* roster, const Segment* segment, const CrewCannotOperateSpecificTaskForPRRuleParam& ruleParam) const;

	void ThrowRuleViolationForFlight(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const Segment* segment, const CrewCannotOperateSpecificTaskForPRRuleParam& ruleParam) const;

	void ThrowRuleViolationForGroundRoster(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const CrewCannotOperateSpecificTaskForPRRuleParam& ruleParam) const;
};

#endif //_CREWCANNOTOPERATESPECIFICTASKFORPRRULE_H_
