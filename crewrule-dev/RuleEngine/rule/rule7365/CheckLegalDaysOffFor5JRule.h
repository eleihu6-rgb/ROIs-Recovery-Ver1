/**
 * @file CheckLegalDaysOffFor5JRule.h
 * @brief Rule 7365 - Legal Days Off validation for 5J
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-04-14
**/

#ifndef _CHECKLEGALDAYSOFFFOR5JRULE_H_
#define _CHECKLEGALDAYSOFFFOR5JRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckLegalDaysOffFor5JRuleParam.h"

class Rule7365TestAccess;

class CheckLegalDaysOffFor5JRule : public BasicRule {
    friend class Rule7365TestAccess;
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7365;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
    constexpr static ViolationType RuleViolationType = ViolationType::ROSTER;

    explicit CheckLegalDaysOffFor5JRule(const RuleSystem* system, const InputType& input)
        : BasicRule(system, CheckLegalDaysOffFor5JRule::RuleFuncId, CheckLegalDaysOffFor5JRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CheckLegalDaysOffFor5JRule() override = default;

    bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

    std::vector<CheckLegalDaysOffFor5JRuleParam> _ruleParams;

    // 验证单个连续DO组（含向前空白天扩展后的校验窗口）
    bool ValidateConsecutiveDayOffGroup(CheckLegalDaysOffFor5JRuleParam::DayOffGroupInfo& dayOffGroup,
        const CheckLegalDaysOffFor5JRuleParam& ruleParam, const string& base,
        const std::vector<const ROSTER*>& allRosters) const;

    // 抛出违规报警（整个组的开始和结束时间）
    void ThrowRuleViolation(const time_t groupStartUtc, const time_t groupEndUtc) const;

    void ParseParam(const InputType& input);

};

#endif //_CHECKLEGALDAYSOFFFOR5JRULE_H_
