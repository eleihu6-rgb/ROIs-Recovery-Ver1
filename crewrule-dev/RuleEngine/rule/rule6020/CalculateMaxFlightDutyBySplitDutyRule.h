/**
 * @file CalculateMaxFlightDutyBySplitDutyRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CALCULATEMAXFLIGHTDUTYBYSPLITDUTYRULE_H_
#define _CALCULATEMAXFLIGHTDUTYBYSPLITDUTYRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MaxFlightDutyBySplitDutyRuleParam.h"
#include "RuleParams.h"

class WorkPeriod;
class RestPeriod;
class WindowTime;
class Period;

class CalculateMaxFlightDutyBySplitDutyRule : public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6020;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty;
    constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

    explicit CalculateMaxFlightDutyBySplitDutyRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMaxFlightDutyBySplitDutyRule::RuleFuncId, CalculateMaxFlightDutyBySplitDutyRule::AvailableInterface) {
        ParseParam(input);
    }
    ~CalculateMaxFlightDutyBySplitDutyRule() override = default;

	void CalculateDuty(Duty *duty) override;

	void CalculateDuty(Pairing* pairing) override;
private:

    std::mutex _6020mutex;

    std::vector<MaxFlightDutyBySplitDutyRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	//计算Duty特定segment
    //lastMaxFDP: 上次计算MaxFDP
	bool CalculateDuty(int& lastMaxFDP, Duty *duty, const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit, const MaxFlightDutyBySplitDutyRuleParam& ruleParam);

	//获得重新计算的Max FDP
	int GetIncreaseFDP(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit, const Duty *duty, const MaxFlightDutyBySplitDutyRuleParam& ruleParam);
};





#endif //_CALCULATEMAXFLIGHTDUTYBYSPLITDUTYRULE_H_
