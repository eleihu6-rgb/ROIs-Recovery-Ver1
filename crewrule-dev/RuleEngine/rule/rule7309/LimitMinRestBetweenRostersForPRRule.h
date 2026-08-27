/**
 * @file LimitMinRestBetweenRostersForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _LIMITMINRESTBETWEENROSTERSFORPRRULE_H_
#define _LIMITMINRESTBETWEENROSTERSFORPRRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "LimitMinRestBetweenRostersForPRRuleParam.h"


class LimitMinRestBetweenRostersForPRRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7309;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitMinRestBetweenRostersForPRRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitMinRestBetweenRostersForPRRule::RuleFuncId, LimitMinRestBetweenRostersForPRRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitMinRestBetweenRostersForPRRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<LimitMinRestBetweenRostersForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitMinRestBetweenRostersForPRRuleParam& ruleParam) const;

	bool CheckRule(const time_t restStartTimeUtc, const time_t restEndTimeUtc, const int offsetTZMinutes, const LimitMinRestBetweenRostersForPRRuleParam& ruleParam) const;

private:

	vector<std::tuple<time_t, time_t>> GetRestBetweenRosters(const ROSTER* prevRoster, const ROSTER* nextRoster, const std::vector<const ROSTER*>& subRosters, const int offsetTZMinutes, const LimitMinRestBetweenRostersForPRRuleParam&  ruleParam) const;
	
	int GetConsecutiveTimesOrDaysWithCurrRoster(const ROSTER* currRoster, const ROSTER* nextRoster, const LimitMinRestBetweenRostersForPRRuleParam& ruleParam) const;

	//获得下一个工作的Roster。若没有则返回-1
	int GetNextWorkRosterIndex(const ROSTER* prevRoster, const std::vector<const ROSTER*>& rosters, const size_t currIndex, const LimitMinRestBetweenRostersForPRRuleParam& ruleParam) const;

	bool IsRestAssignment(const ROSTER* roster, const LimitMinRestBetweenRostersForPRRuleParam& ruleParam) const;

	void ThrowRuleViolation(const ROSTER* roster, const time_t restStartTimeUtc, const time_t restEndTimeUtc, const LimitMinRestBetweenRostersForPRRuleParam& ruleParam) const;

};

#endif //_LIMITMINRESTBETWEENROSTERSFORPRRULE_H_
