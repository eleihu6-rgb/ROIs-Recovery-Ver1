/**
 * @file CalculateExtraDaysOffAtBaseForSQRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-25
**/



#ifndef _CALCULATEEXTRADAYSOFFATBASEFORSQRULE_H_
#define _CALCULATEEXTRADAYSOFFATBASEFORSQRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "ExtraDaysOffAtBaseForSQRuleParam.h"


class CalculateExtraDaysOffAtBaseForSQRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 7466;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateExtraDaysOffAtBaseForSQRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateExtraDaysOffAtBaseForSQRule::RuleFuncId, CalculateExtraDaysOffAtBaseForSQRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateExtraDaysOffAtBaseForSQRule() override = default;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:

	struct RuleInstance {
		long long ruleId{0};
		Exdo7466ControlParam control{};
		std::vector<ExtraDaysOffAtBaseForSQRuleParam> params;
	};

    std::vector<RuleInstance> _ruleInstances;

	void ParseParam(const InputType& input);

	bool CalculateDuty(Pairing* pairing,
	                   const ExtraDaysOffAtBaseForSQRuleParam& ruleParam,
	                   const Exdo7466ControlParam& control);

	//检查是否满足最小本地夜晚要求，满足返回true，否则false
	bool CheckMinLocalNight(const Duty* currDuty, const Duty* nextDuty) const;

	//获得满足本地夜晚时间的最小休息时长
	int GetMinRestMeetingLocalNight(const Duty* currDuty, const Duty* nextDuty) const;
};

#endif //_CALCULATEEXTRADAYSOFFATBASEFORSQRULE_H_
