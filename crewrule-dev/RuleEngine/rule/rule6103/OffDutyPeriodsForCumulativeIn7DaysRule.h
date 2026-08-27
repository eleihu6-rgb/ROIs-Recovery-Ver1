/**
 * @file MinOffDutyPeriodForCcRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _OFFDUTYPERIODSFORCUMULATIVEIN7DAYSRULE_H_
#define _OFFDUTYPERIODSFORCUMULATIVEIN7DAYSRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "OffDutyPeriodsForCumulativeIn7DaysRuleParam.h"

class WorkPeriod;
class RestPeriod;
class WindowTime;
class Period;

class OffDutyPeriodsForCumulativeIn7DaysRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6103;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit OffDutyPeriodsForCumulativeIn7DaysRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, OffDutyPeriodsForCumulativeIn7DaysRule::RuleFuncId, OffDutyPeriodsForCumulativeIn7DaysRule::AvailableInterface) {
        ParseParam(input);
    }
    ~OffDutyPeriodsForCumulativeIn7DaysRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<OffDutyPeriodsForCumulativeIn7DaysRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const Pairing* pairing, const std::vector<std::unique_ptr<RestPeriod>>& restPeriods, 
		const OffDutyPeriodsForCumulativeIn7DaysRuleParam& ruleParam) const;

	bool CheckRule(const Duty* duty, const std::vector<std::unique_ptr<RestPeriod>>& restPeriods,
		const OffDutyPeriodsForCumulativeIn7DaysRuleParam& ruleParam) const;

	/**
	* 检查在开始时间和结束时间内，是否满足最小本地夜晚天数（minLocalNight）和至少连续最小休息时长（minRest）小时
	*/
	bool CheckRule(const time_t startTimeUtc, const time_t endTimeUtc,
		const std::vector<std::unique_ptr<RestPeriod>>& restPeriods,
		const unsigned int minLocalNight, const unsigned int minRest, const int offsetTZMinute) const;

	time_t GetEndTimeForDuty(const Duty* duty,
		const std::string& checkPeriodStartOrEnd, const std::string& timePeriodUnit,
		const int offsetTZMinute) const;


	int GetLocalNightNums(const time_t startTimeUtc, const time_t endTimeUtc, const unsigned int minLocalNight, const int offsetTZMinute) const;

	void ThrowRuleViolation() const;
};





#endif //_OFFDUTYPERIODSFORCUMULATIVEIN7DAYSRULE_H_
