/**
 * @file LimitSameDeviceInProgramForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITSAMEDEVICEINPROGRAMFOREVAFDRULE_H_
#define _LIMITSAMEDEVICEINPROGRAMFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitSameDeviceInProgramForEvaFdRuleParam.h"


class LimitSameDeviceInProgramForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7246;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitSameDeviceInProgramForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitSameDeviceInProgramForEvaFdRule::RuleFuncId, LimitSameDeviceInProgramForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitSameDeviceInProgramForEvaFdRule() override = default;

	bool CheckRule(const std::shared_ptr<CREW>& crew) const override;

private:

	std::vector<LimitSameDeviceInProgramForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const long long programId, const vector<std::shared_ptr<TmProgramCourse>>& tmProgramCourseList, const std::shared_ptr<CREW>& crew, const LimitSameDeviceInProgramForEvaFdRuleParam& ruleParam) const;
	
	void ThrowRuleViolation(const std::shared_ptr<TmProgramCourse>& programCourseA, const std::shared_ptr<TmProgramCourse>& programCourseB, const LimitSameDeviceInProgramForEvaFdRuleParam& ruleParam) const;

};

#endif //_LIMITSAMEDEVICEINPROGRAMFOREVAFDRULE_H_
