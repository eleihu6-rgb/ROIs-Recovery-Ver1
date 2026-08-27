/**
 * @file CheckMinRestAtBaseOrLayoverStationRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _MINRESTATBASEORLAYOVERSTATION_H_
#define _MINRESTATBASEORLAYOVERSTATION_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "MinRestAtBaseOrLayoverStationRuleParam.h"


class CheckMinRestAtBaseOrLayoverStationRule: public BasicRule {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6105;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty | RuleInterface::Interface::SinglePairing;
    constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CheckMinRestAtBaseOrLayoverStationRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckMinRestAtBaseOrLayoverStationRule::RuleFuncId, CheckMinRestAtBaseOrLayoverStationRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckMinRestAtBaseOrLayoverStationRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

	bool CheckRule(const Pairing* pairing) const override;

	bool CheckRule(const Duty* duty) const override;

private:

    std::vector<MinRestAtBaseOrLayoverStationRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	bool CheckRule(const vector<Duty*>& duties, const map<long long, long>& mapCallinSBY_FDPMins) const;

	bool CheckRule(const Duty *currDuty, const Duty* nextDuty, const std::string& base, const MinRestAtBaseOrLayoverStationRuleParam& ruleParam, const map<long long, long>& mapCallinSBY_FDPMins) const;

	void ThrowRuleViolation(const Duty* duty) const;
};

#endif //_MINRESTATBASEORLAYOVERSTATION_H_
