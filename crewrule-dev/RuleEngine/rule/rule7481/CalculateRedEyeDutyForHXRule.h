/**
 * @file MinOffDutyPeriodForCcRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-14
**/



#ifndef _CalculateRedEyeDutyForHXRule_H_
#define _CalculateRedEyeDutyForHXRule_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "RedEyeDutyForHXRuleParam.h"

class BaseActivityPeriod;

class CalculateRedEyeDutyForHXRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7481;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

    explicit CalculateRedEyeDutyForHXRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateRedEyeDutyForHXRule::RuleFuncId, CalculateRedEyeDutyForHXRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CalculateRedEyeDutyForHXRule() override = default;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;
private:

    std::vector<RedEyeDutyForHXRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

    // Calculate red-eye duties for given rosters
    void CalculateRedEyeDuty(vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const string& defaultBase, const int offsetTZMinutes);

    //基于当前红眼任务，向前检查地面任务Duty是否可以为红眼任务
    void calcRedEyeBefore(const Duty* redEyeDuty, const size_t currIndex, const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const string& defaultBase, const int offsetTZMinutes);

    //基于当前红眼任务，向后检查地面任务Duty是否可以为红眼任务
    void calcRedEyeAfter(const Duty* redEyeDuty, const size_t currIndex, const vector<shared_ptr<BaseActivityPeriod>>& activityPeriods, const string& defaultBase, const int offsetTZMinutes);

private:
    //检查Duty是否是红眼任务
    const bool isRedEyeDuty(RedEyeDefinitionForHXParam*& matchedRuleParam, const Duty* duty, const string& base, const int offsetTZMinutes) const;

    //检查Roster是否是红眼任务
    const bool isRedEyeRoster(RedEyeDefinitionForHXParam*& matchedRuleParam, const ROSTER* roster, const string& base, const int offsetTZMinutes) const;

    //检查飞行Duty（有FDP）是否是红眼任务
    const bool isRedEyeFlyDuty(RedEyeDefinitionForHXParam*& matchedRuleParam, const Duty* duty, const string& base, const int offsetTZMinutes) const;


};





#endif //_CalculateRedEyeDutyForHXRule_H_
