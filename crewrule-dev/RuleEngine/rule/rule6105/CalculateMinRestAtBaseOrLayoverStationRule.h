/**
 * @file CalculateMinRestAtBaseOrLayoverStationRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _CALCULATEMINRESTATBASEORLAYOVERSTATIONRULE_H_
#define _CALCULATEMINRESTATBASEORLAYOVERSTATIONRULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MinRestAtBaseOrLayoverStationRuleParam.h"


class CalculateMinRestAtBaseOrLayoverStationRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6105;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CalculateMinRestAtBaseOrLayoverStationRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, CalculateMinRestAtBaseOrLayoverStationRule::RuleFuncId, CalculateMinRestAtBaseOrLayoverStationRule::AvailableInterface) {
		ParseParam(input);
	}

	~CalculateMinRestAtBaseOrLayoverStationRule() override = default;

	void CalculateDuty(Duty* duty) override;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;

private:

    std::vector<MinRestAtBaseOrLayoverStationRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void CalculateDuty(vector<Duty*> duties, const map<long long, long>& mapCallinSBY_FDPMins);

	bool CalculateDuty(Duty *duty, const std::string& base, const MinRestAtBaseOrLayoverStationRuleParam& ruleParam, const map<long long, long>& mapCallinSBY_FDPMins);

};

#endif //_CALCULATEMINRESTATBASEORLAYOVERSTATIONRULE_H_
