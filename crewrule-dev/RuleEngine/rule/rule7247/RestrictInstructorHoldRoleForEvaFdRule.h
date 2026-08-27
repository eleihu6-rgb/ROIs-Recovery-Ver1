/**
 * @file RestrictInstructorHoldRoleForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _RESTRICTINSTRUCTORHOLDROLEFOREVAFDRULE_H_
#define _RESTRICTINSTRUCTORHOLDROLEFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "RestrictInstructorHoldRoleForEvaFdRuleParam.h"


class RestrictInstructorHoldRoleForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7247;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit RestrictInstructorHoldRoleForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, RestrictInstructorHoldRoleForEvaFdRule::RuleFuncId, RestrictInstructorHoldRoleForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~RestrictInstructorHoldRoleForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<RestrictInstructorHoldRoleForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	//场景1：若复训课程不合格，则不能胜任X角色的教员
	bool CheckRule(const time_t earliestCourseFailTime, const std::shared_ptr<TmProgramCourseInstructor>& programCourseInstructor, const RestrictInstructorHoldRoleForEvaFdRuleParam& ruleParam) const;
	
	//场景2：资质过期，则不能胜任X角色的教员
	bool CheckRule(const std::shared_ptr<TmProgramCourseInstructor>& programCourseInstructor, const map<string, vector<std::shared_ptr<CREW_QUALIFICATION>>>& crewQualMap, const std::shared_ptr<CREW>& crew, const time_t checkedStartTime, const time_t checkedEndTime, const RestrictInstructorHoldRoleForEvaFdRuleParam& ruleParam) const;

	void ThrowRuleViolationForCourseFail(const ROSTER* roster, const RestrictInstructorHoldRoleForEvaFdRuleParam& ruleParam) const;

	void ThrowRuleViolationForQualExpire(const ROSTER* roster, const RestrictInstructorHoldRoleForEvaFdRuleParam& ruleParam) const;
private:

	//返回值：map<资质名称，该资质对应的人员资质列表(必须按开始时间升序排序)>
	const map<string, vector<std::shared_ptr<CREW_QUALIFICATION>>> GetCrewQualMap(const std::shared_ptr<CREW>& crew) const;

	//获得crew作为学员最早复训课程未通过的时间
	const time_t GetEarliestCourseFailTime(const std::shared_ptr<CREW>& crew, const RestrictInstructorHoldRoleForEvaFdRuleParam& ruleParam) const;

	

};

#endif //_RESTRICTINSTRUCTORHOLDROLEFOREVAFDRULE_H_
