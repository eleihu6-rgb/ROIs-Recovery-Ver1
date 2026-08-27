/**
 * @file LimitMinRestByBlockTimeForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-12-03
**/



#ifndef _LIMITMINRESTBYBLOCKTIMEFORPRRULE_H_
#define _LIMITMINRESTBYBLOCKTIMEFORPRRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CalculateMinRestByBlockTimeForPRRuleParam.h"
#include "../period/WorkPeriod.h"

class LimitMinRestByBlockTimeForPRRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7311;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitMinRestByBlockTimeForPRRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitMinRestByBlockTimeForPRRule::RuleFuncId, LimitMinRestByBlockTimeForPRRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitMinRestByBlockTimeForPRRule() override = default;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<CalculateMinRestByBlockTimeForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

private:

	std::tuple<int, const CalculateMinRestByBlockTimeForPRRuleParam*> GetMinRest(const Duty* duty, const ROSTER* roster, const map<long long, vector<std::shared_ptr<TmCourse>>>& flightCourseMap) const;

	bool CheckRule(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods, const map<long long, vector<std::shared_ptr<TmCourse>>>& flightCourseMap) const;

	bool CheckRule(const WorkPeriod* currWorkPeriod, const int minRestOfCurrDuty, const WorkPeriod* nextWorkPeriod, const CalculateMinRestByBlockTimeForPRRuleParam& ruleParam) const;

	bool CheckRule(const Duty* currDuty, const int minRestOfCurrDuty, const ROSTER* currRoster, const WorkPeriod* nextWorkPeriod, const CalculateMinRestByBlockTimeForPRRuleParam& ruleParam) const;

	//是否是工作任务
	bool IsWorkAssignment(const WorkPeriod* workPeriod, const CalculateMinRestByBlockTimeForPRRuleParam& ruleParam) const;

	void ThrowRuleViolation(const Duty* duty, const ROSTER* roster, const CalculateMinRestByBlockTimeForPRRuleParam& ruleParam) const;

};

#endif //_LIMITMINRESTBYBLOCKTIMEFORPRRULE_H_
