/**
 * @file MinOffDutyPeriodForCcRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _OFFDUTYPERIODSFORCUMULATIVEIN28DAYSRULE_H_
#define _OFFDUTYPERIODSFORCUMULATIVEIN28DAYSRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "OffDutyPeriodsForCumulativeIn28DaysRuleParam.h"

class WorkPeriod;
class RestPeriod;
class WindowTime;
class Period;

class OffDutyPeriodsForCumulativeIn28DaysRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6104;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit OffDutyPeriodsForCumulativeIn28DaysRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, OffDutyPeriodsForCumulativeIn28DaysRule::RuleFuncId, OffDutyPeriodsForCumulativeIn28DaysRule::AvailableInterface) {
        ParseParam(input);
    }
    ~OffDutyPeriodsForCumulativeIn28DaysRule() override = default;

	bool CheckRule(const Pairing* pairing) const override;
	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<OffDutyPeriodsForCumulativeIn28DaysRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const Pairing* pairing, const OffDutyPeriodsForCumulativeIn28DaysRuleParam& ruleParam) const;

};





#endif //_OFFDUTYPERIODSFORCUMULATIVEIN28DAYSRULE_H_
