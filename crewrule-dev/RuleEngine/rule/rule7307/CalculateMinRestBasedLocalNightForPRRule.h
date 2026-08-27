/**
 * @file CalculateMinRestBasedLocalNightForPRRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CALCULATEMINRESTBASEDLOCALNIGHTFORPRRULE_H_
#define _CALCULATEMINRESTBASEDLOCALNIGHTFORPRRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MinRestBasedLocalNightForPRRuleParam.h"


class CalculateMinRestBasedLocalNightForPRRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7307;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateMinRestBasedLocalNightForPRRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMinRestBasedLocalNightForPRRule::RuleFuncId, CalculateMinRestBasedLocalNightForPRRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateMinRestBasedLocalNightForPRRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:

    std::vector<MinRestBasedLocalNightForPRRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(vector<Duty*> duties);

	bool CalculateDuty(Duty* currDuty, Duty* nextDuty, const string& base, const MinRestBasedLocalNightForPRRuleParam& ruleParam);

	//检查是否满足最小本地夜晚要求，满足返回true，否则false
	bool CheckMinLocalNight(const Duty* currDuty, const Duty* nextDuty) const;

	//获得满足本地夜晚时间的最小休息时长
	int GetMinRestMeetingLocalNight(const Duty* currDuty, const Duty* nextDuty) const;
};

#endif //_CALCULATEMINRESTBASEDLOCALNIGHTFORPRRULE_H_
