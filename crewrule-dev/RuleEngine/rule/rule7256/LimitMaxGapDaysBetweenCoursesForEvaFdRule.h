/**
 * @file LimitMaxGapDaysBetweenCoursesForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITMAXGAPDAYSBETWEENCOURSESFOREVAFDRULE_H_
#define _LIMITMAXGAPDAYSBETWEENCOURSESFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitMaxGapDaysBetweenCoursesForEvaFdRuleParam.h"


class LimitMaxGapDaysBetweenCoursesForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7256;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitMaxGapDaysBetweenCoursesForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitMaxGapDaysBetweenCoursesForEvaFdRule::RuleFuncId, LimitMaxGapDaysBetweenCoursesForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitMaxGapDaysBetweenCoursesForEvaFdRule() override = default;

	bool CheckRule(const std::shared_ptr<CREW>& crew) const override;

private:

	std::vector<LimitMaxGapDaysBetweenCoursesForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes) const;

	void ThrowRuleViolation(const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const LimitMaxGapDaysBetweenCoursesForEvaFdRuleParam& ruleParam) const;

};

#endif //_LIMITMAXGAPDAYSBETWEENCOURSESFOREVAFDRULE_H_
