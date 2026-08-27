/**
 * @file LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITNUMBEROFTRAINEEFORCOURSESONSAMEDAYFOREVAFDRULE_H_
#define _LIMITNUMBEROFTRAINEEFORCOURSESONSAMEDAYFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRuleParam.h"


class LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7257;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRule::RuleFuncId, LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRule() override = default;

	bool CheckRule(const std::shared_ptr<CREW>& crew) const override;

private:

	std::vector<LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes) const;

	bool CheckRule(const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const std::set<time_t>& requiredCourseLocalDates, const int offsetTZMinutes, const LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRuleParam& ruleParam) const;

	void ThrowRuleViolation(const std::shared_ptr<TmProgramCourse>& tmProgramCourse, const time_t requiredCourseLocalDate, const int offsetTZMinutes, const LimitNumberOfTraineeForCoursesOnSameDayForEvaFdRuleParam& ruleParam) const;

};

#endif //_LIMITNUMBEROFTRAINEEFORCOURSESONSAMEDAYFOREVAFDRULE_H_
