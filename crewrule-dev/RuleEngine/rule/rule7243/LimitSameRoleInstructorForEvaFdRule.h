/**
 * @file LimitSameRoleInstructorForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITSAMEROLEINSTRUCTORFOREVAFDRULE_H_
#define _LIMITSAMEROLEINSTRUCTORFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitSameRoleInstructorForEvaFdRuleParam.h"


class LimitSameRoleInstructorForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7243;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitSameRoleInstructorForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitSameRoleInstructorForEvaFdRule::RuleFuncId, LimitSameRoleInstructorForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitSameRoleInstructorForEvaFdRule() override = default;

	bool CheckRule(const std::shared_ptr<CREW>& crew) const override;

private:

	std::vector<LimitSameRoleInstructorForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const long long programId, const std::shared_ptr<TmProgramCourse>& currProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<CREW>& crew, const bool isTrainee) const;

	bool CheckRule(const std::shared_ptr<TmProgramCourse>& programCourseA, const std::shared_ptr<TmProgramCourse>& programCourseB, const std::shared_ptr<TmProgramCourseLimitation>& programCourseLimitation, const std::shared_ptr<CREW>& crew, const bool isTrainee) const;

	void ThrowRuleViolation(const std::shared_ptr<TmProgramCourse>& programCourseA, const std::shared_ptr<TmProgramCourse>& programCourseB, const std::shared_ptr<TmProgramCourseLimitation>& programCourseLimitation) const;

};

#endif //_LIMITSAMEROLEINSTRUCTORFOREVAFDRULE_H_
