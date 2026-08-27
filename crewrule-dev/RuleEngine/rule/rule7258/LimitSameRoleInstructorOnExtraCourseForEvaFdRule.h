/**
 * @file LimitSameRoleInstructorOnExtraCourseForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITSAMEROLEINSTRUCTORONEXTRACOURSEFOREVAFDRULE_H_
#define _LIMITSAMEROLEINSTRUCTORONEXTRACOURSEFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitSameRoleInstructorOnExtraCourseForEvaFdRuleParam.h"

class LimitSameRoleInstructorOnExtraCourseForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7258;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitSameRoleInstructorOnExtraCourseForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitSameRoleInstructorOnExtraCourseForEvaFdRule::RuleFuncId, LimitSameRoleInstructorOnExtraCourseForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitSameRoleInstructorOnExtraCourseForEvaFdRule() override = default;

	bool CheckRule(const std::shared_ptr<CREW>& crew) const override;

private:

	std::vector<LimitSameRoleInstructorOnExtraCourseForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const long long programId, const std::shared_ptr<TmProgramCourse>& currProgramCourse, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<CREW>& crew) const;

	bool CheckRule(const std::shared_ptr<TmProgramCourse>& programCourseA, const std::shared_ptr<TmProgramCourse>& programCourseB, const std::shared_ptr<CREW>& crew) const;

	void ThrowRuleViolation(set<string>& sameCrewIds, const std::shared_ptr<TmProgramCourse>& programCourseA, const std::shared_ptr<TmProgramCourse>& programCourseB, const LimitSameRoleInstructorOnExtraCourseForEvaFdRuleParam& ruleParam) const;

};

#endif //_LIMITSAMEROLEINSTRUCTORONEXTRACOURSEFOREVAFDRULE_H_
