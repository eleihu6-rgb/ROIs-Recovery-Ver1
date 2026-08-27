/**
 * @file CheckPassportAndVisaForEvaFdRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CHECKPASSPORTANDVISAFOREVAFDRULE_H_
#define _CHECKPASSPORTANDVISAFOREVAFDRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckPassportAndVisaForEvaFdRuleParam.h"


class CheckPassportAndVisaForEvaFdRule : public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7229;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::GroupedRoster;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckPassportAndVisaForEvaFdRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckPassportAndVisaForEvaFdRule::RuleFuncId, CheckPassportAndVisaForEvaFdRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckPassportAndVisaForEvaFdRule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<CheckPassportAndVisaForEvaFdRuleParam> _ruleParams;

    void ParseParam(const InputType& input);

    void ThrowRuleViolation(const ROSTER* roster) const;

    time_t GetEndDayByHolidayOrWeekend(const time_t startDay, const int days, const bool isWithoutHolidayAndWeekend, const std::vector<std::string> holidayCountries) const;

    bool isHoliday(const time_t time, const std::vector<std::string> holidayContries) const;
    bool isWeekend(const time_t time) const;
};

#endif //_CHECKPassportANDVISAFOREVAFDRULE_H_
