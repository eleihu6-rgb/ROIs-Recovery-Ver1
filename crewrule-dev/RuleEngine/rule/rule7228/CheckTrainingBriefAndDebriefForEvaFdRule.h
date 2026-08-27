#pragma once
#ifndef _CHECKTRAININGBRIEFANDDEBRIEFFOREVAFDRULE_H_
#define _CHECKTRAININGBRIEFANDDEBRIEFFOREVAFDRULE_H_

#include <string>
#include <tuple>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "TrainingBriefAndDebriefForEvaFdRuleParam.h"



class CheckTrainingBriefAndDebriefForEvaFdRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7228;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit CheckTrainingBriefAndDebriefForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckTrainingBriefAndDebriefForEvaFdRule::RuleFuncId, CheckTrainingBriefAndDebriefForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckTrainingBriefAndDebriefForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:


	std::vector<TrainingBriefAndDebriefForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const;

	bool CheckRule(const ROSTER* roster, const Duty* duty, const std::shared_ptr<CREW>& crew) const;

	/*
	* 获得课程的签到和签出时长(分钟数)
	* @param courseId课程ID
	* @param role 角色
	* @return tuple<brief时长,debrief时长> 若没有brief/debrief配置则为-1
	*/
	std::tuple<int, int> GetCourseBriefAndDebrief(const long long courseId, const string& role) const;

	void ThrowRuleViolationForBrief(const ROSTER* roster, const string& crewRole, const long long courseId, const int requiredBriefMinutes, const int actualBriefMin) const;
	void ThrowRuleViolationForDebrief(const ROSTER* roster, const string& crewRole, const long long courseId, const int requiredDebriefMinutes, const int actualDebriefMin) const;
};

#endif //_CHECKTRAININGBRIEFANDDEBRIEFFOREVAFDRULE_H_