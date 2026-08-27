/**
 * @file RestrictTraineeHoldAssignmentForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _RESTRICTTRAINEEHOLDASSIGNMENTFOREVAFDRULE_H_
#define _RESTRICTTRAINEEHOLDASSIGNMENTFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "RestrictTraineeHoldAssignmentForEvaFdRuleParam.h"


class RestrictTraineeHoldAssignmentForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7248;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit RestrictTraineeHoldAssignmentForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, RestrictTraineeHoldAssignmentForEvaFdRule::RuleFuncId, RestrictTraineeHoldAssignmentForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~RestrictTraineeHoldAssignmentForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<RestrictTraineeHoldAssignmentForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void ThrowRuleViolationForRole(const std::shared_ptr<TmProgramCourseInstructor>& tmProgramCourseInstructor, const ROSTER* roster, const RestrictTraineeHoldAssignmentForEvaFdRuleParam& ruleParam) const;

	void ThrowRuleViolationForAssignment(const ROSTER* roster, const RestrictTraineeHoldAssignmentForEvaFdRuleParam& ruleParam) const;
private:
	//获得检查时间段，返回值：tuple<检查限制开始时间，检查限制结束时间>
	const std::tuple<time_t, time_t> GetLimitTimeWindow(const vector<std::shared_ptr<TmProgram>>& tmProgramList, const int offsetTZMinutes, const RestrictTraineeHoldAssignmentForEvaFdRuleParam& ruleParam) const;

};

#endif //_RESTRICTTRAINEEHOLDASSIGNMENTFOREVAFDRULE_H_
