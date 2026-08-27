/**
 * @file LimitMinWorkDaysBetweenAssignmentsForHXRule.h
 * @brief 7496法规规则类
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-05
**/

#ifndef _LIMITMINWORKDAYSBETWEENASSIGNMENTSFORHXRULE_H_
#define _LIMITMINWORKDAYSBETWEENASSIGNMENTSFORHXRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MinWorkDaysBetweenAssignmentsForHXRuleParam.h"

class LimitMinWorkDaysBetweenAssignmentsForHXRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7496;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
	constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

	explicit LimitMinWorkDaysBetweenAssignmentsForHXRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, LimitMinWorkDaysBetweenAssignmentsForHXRule::RuleFuncId, LimitMinWorkDaysBetweenAssignmentsForHXRule::AvailableInterface) {
		ParseParam(input);
	}
	~LimitMinWorkDaysBetweenAssignmentsForHXRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:
	std::vector<MinWorkDaysBetweenAssignmentsForHXRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const std::vector<const ROSTER*>& rosters, const time_t checkedStartTime, const time_t checkedEndTime, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const MinWorkDaysBetweenAssignmentsForHXRuleParam& ruleParam) const;

	//定向检查规则（支持A->B或B->A方向）
	bool CheckDirectionalRule(const std::vector<const ROSTER*>& rosters, const int offsetTZMinutes, const MinWorkDaysBetweenAssignmentsForHXRuleParam& ruleParam, bool isAToB) const;

	//获取连续任务的结束索引和起始索引（isAssignmentA=true表示任务A，false表示任务B）
	int GetConsecutiveAssignmentEndIndex(int& startIndex, const std::vector<const ROSTER*>& rosters, int startIdx, const int offsetTZMinutes, const MinWorkDaysBetweenAssignmentsForHXRuleParam& ruleParam, bool isAssignmentA) const;

	//获取连续任务的开始索引和结束索引（isAssignmentA=true表示任务A，false表示任务B）
	int GetConsecutiveAssignmentStartIndex(int& endIndex, const std::vector<const ROSTER*>& rosters, int startIdx, const int offsetTZMinutes, const MinWorkDaysBetweenAssignmentsForHXRuleParam& ruleParam, bool isAssignmentA) const;

	//计算两个连续任务之间的工作天数
	int CalculateWorkingDays(int startIdx, int endIdx, const std::vector<const ROSTER*>& rosters, const int offsetTZMinutes, const MinWorkDaysBetweenAssignmentsForHXRuleParam& ruleParam) const;

	//抛出违规信息
	void ThrowRuleViolation(const ROSTER* rosterA, const ROSTER* rosterB, const int actualWorkingDays, const MinWorkDaysBetweenAssignmentsForHXRuleParam& ruleParam, const std::string& direction = "") const;
};

#endif //_LIMITMINWORKDAYSBETWEENASSIGNMENTSFORHXRULE_H_