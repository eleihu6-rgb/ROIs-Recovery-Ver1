/**
 * @file LimitConsecutiveTaskBeforeAfterDayOffForHXRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-03
**/

#ifndef _LIMITCONSECUTIVETASKBEOREAFTERDAYOFFFORHXRULE_H_
#define _LIMITCONSECUTIVETASKBEOREAFTERDAYOFFFORHXRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "ConsecutiveTaskBeforeAfterDayOffForHXRuleParam.h"
#include "../rule7401/AnrDayOffDefinition.h"

class LimitConsecutiveTaskBeforeAfterDayOffForHXRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7495;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitConsecutiveTaskBeforeAfterDayOffForHXRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitConsecutiveTaskBeforeAfterDayOffForHXRule::RuleFuncId, LimitConsecutiveTaskBeforeAfterDayOffForHXRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitConsecutiveTaskBeforeAfterDayOffForHXRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	std::vector<ConsecutiveTaskBeforeAfterDayOffForHXRuleParam> _ruleParams;

	AnrDayOffDefinition _dayOffDefinition;

	void ParseParam(const InputType& input);

	bool CheckRule(const std::vector<const ROSTER*>& rosters, const time_t checkedStartTime, const time_t checkedEndTime, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const ConsecutiveTaskBeforeAfterDayOffForHXRuleParam& ruleParam) const;

	bool CheckPreDaysOff(const std::vector<const ROSTER*>& rosters, const int startIndex, const int endIndex, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const ConsecutiveTaskBeforeAfterDayOffForHXRuleParam& ruleParam) const;

	bool CheckPostDaysOff(const std::vector<const ROSTER*>& rosters, const int startIndex, const int endIndex, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const ConsecutiveTaskBeforeAfterDayOffForHXRuleParam& ruleParam) const;

	/*
	* 获得满足条件的连续任务天数，并通过endIndex返回连续任务的结束索引位置
	* @param endIndex 输出参数，连续任务的结束索引位置，初始值由调用函数传入
	* @param rosters 待检查的任务列表
	* @param startIndex 连续任务的开始索引位置
	* @param offsetTZMinutes 时区偏移分钟数
	* @param ruleParam 规则参数
	* @return 满足条件的连续任务天数
	*/
	int GetConsecutiveAssignmentDays(int& endIndex, const std::vector<const ROSTER*>& rosters, int startIndex, const int offsetTZMinutes, const ConsecutiveTaskBeforeAfterDayOffForHXRuleParam& ruleParam) const;

	void ThrowRuleViolationForMaxConsecutiveDays(const ROSTER* startRoster, const ROSTER* endRoster, const ConsecutiveTaskBeforeAfterDayOffForHXRuleParam& ruleParam) const;
	void ThrowRuleViolationForBeforeAfter(const ROSTER* startRoster, const ROSTER* endRoster, const std::string& violationType, const int actualDaysOff, const ConsecutiveTaskBeforeAfterDayOffForHXRuleParam& ruleParam) const;
};

#endif //_LIMITCONSECUTIVETASKBEOREAFTERDAYOFFFORHXRULE_H_