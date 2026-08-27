/**
 * @file LimitSameCourseCodeInDutyForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITSAMECOURSECODEINDUTYFOREVAFDRULE_H_
#define _LIMITSAMECOURSECODEINDUTYFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitSameCourseCodeInDutyForEvaFdRuleParam.h"


struct TmProgramCourseAndSegment;

class LimitSameCourseCodeInDutyForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7255;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitSameCourseCodeInDutyForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitSameCourseCodeInDutyForEvaFdRule::RuleFuncId, LimitSameCourseCodeInDutyForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitSameCourseCodeInDutyForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<LimitSameCourseCodeInDutyForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const LimitSameCourseCodeInDutyForEvaFdRuleParam& ruleParam) const;

	bool CheckRule(const ROSTER* roster, const Duty* duty, const Segment* segment, const std::shared_ptr<TmProgramCourse>& cofProgramCourse, const std::shared_ptr<CREW>& crew, const LimitSameCourseCodeInDutyForEvaFdRuleParam& ruleParam) const;

	//判断是否是Sub Course（同一机组人员，在同一训练航班上，A课程是Trainee，B课程是教员Instructor）
	bool IsSubCourse(const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const vector<std::shared_ptr<TmProgramCourseInstructor>>& tmProgramCourseInstructorList) const;

	void ThrowRuleViolation(const ROSTER* roster, const Duty* duty, const Segment* segment, const set<long long>& courseIdsOfSegment) const;

};

#endif //_LIMITSAMECOURSECODEINDUTYFOREVAFDRULE_H_
