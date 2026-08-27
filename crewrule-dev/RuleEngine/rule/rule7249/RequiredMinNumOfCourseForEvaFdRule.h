/**
 * @file RequiredMinNumOfCourseForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _REQUIREDMINNUMOFCOURSEFOREVAFDRULE_H_
#define _REQUIREDMINNUMOFCOURSEFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "RequiredMinNumOfCourseForEvaFdRuleParam.h"


class RequiredMinNumOfCourseForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7249;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit RequiredMinNumOfCourseForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, RequiredMinNumOfCourseForEvaFdRule::RuleFuncId, RequiredMinNumOfCourseForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~RequiredMinNumOfCourseForEvaFdRule() override = default;

	bool CheckRule(const std::shared_ptr<CREW>& crew) const override;

private:

	std::vector<RequiredMinNumOfCourseForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const long long programId, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const vector<std::shared_ptr<TmProgramCourse>>& allProgramCourseListconst, const int offsetTZMinutes, const std::shared_ptr<CREW>& crew, const RequiredMinNumOfCourseForEvaFdRuleParam& ruleParam) const;

	void ThrowRuleViolation(const std::shared_ptr<TmProgram>& tmProgram, const time_t limitStartMonth, const time_t limitEndMonth, const RequiredMinNumOfCourseForEvaFdRuleParam& ruleParam) const;

	void ThrowRuleViolationForMonthly(const std::shared_ptr<TmProgram>& tmProgram, const time_t limitStartMonth, const time_t limitEndMonth, const RequiredMinNumOfCourseForEvaFdRuleParam& ruleParam) const;

	void ThrowRuleViolationForPeriod(const std::shared_ptr<TmProgram>& tmProgram, const time_t limitStartTime, const time_t limitEndTime, const RequiredMinNumOfCourseForEvaFdRuleParam& ruleParam) const;
private:
	//获得检查时间段，返回值：tuple<检查限制开始时间，检查限制结束时间>
	const std::tuple<time_t, time_t> GetLimitTimeWindow(const std::shared_ptr<TmProgram>& tmProgram, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const int offsetTZMinutes, const RequiredMinNumOfCourseForEvaFdRuleParam& ruleParam) const;

	const time_t GetReferenceTime(const std::shared_ptr<TmProgram>& tmProgram, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const string& referenceTime, const int offsetTZMinutes) const;

};

#endif //_REQUIREDMINNUMOFCOURSEFOREVAFDRULE_H_
