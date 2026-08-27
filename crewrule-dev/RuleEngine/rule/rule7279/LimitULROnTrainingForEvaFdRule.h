/**
 * @file LimitULROnTrainingForEvaFdRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-04-14
**/

#ifndef _LIMITULRONTRAININGFOREVAFDRULE_H_
#define _LIMITULRONTRAININGFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitULROnTrainingForEvaFdRuleParam.h"


struct TmProgramCourse;

class LimitULROnTrainingForEvaFdRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7279;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitULROnTrainingForEvaFdRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitULROnTrainingForEvaFdRule::RuleFuncId, LimitULROnTrainingForEvaFdRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitULROnTrainingForEvaFdRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<LimitULROnTrainingForEvaFdRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const ROSTER* roster, const std::shared_ptr<CREW>& crew, const LimitULROnTrainingForEvaFdRuleParam& ruleParam) const;

	bool CheckRule(const ROSTER* roster, const Duty* duty, const Segment* segment, const std::shared_ptr<TmProgramCourse>& cofProgramCourse, const std::shared_ptr<CREW>& crew, const LimitULROnTrainingForEvaFdRuleParam& ruleParam) const;

	void ThrowRuleViolation(const std::shared_ptr<TmProgramCourse>& programCourse, const ROSTER* roster, const Duty* duty, const Segment* segment, const std::vector<std::string>& matchedRoutes, const LimitULROnTrainingForEvaFdRuleParam& ruleParam) const;

};

#endif //_LIMITULRONTRAININGFOREVAFDRULE_H_
