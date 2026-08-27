/**
 * @file ReduceOffDutyPeriodAwayFromBaseRule.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/



#ifndef _REDUCEOFFDUTYPERIODAWAYFROMBASERULE_H_
#define _REDUCEOFFDUTYPERIODAWAYFROMBASERULE_H_

#include <string>
#include "../CalculateRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "ReduceOffDutyPeriodAwayFromBaseRuleParam.h"


class ReduceOffDutyPeriodAwayFromBaseRule: public CalculateRule<int> {
public:
    using InputType = RuleInput;
    constexpr static unsigned int RuleFuncId = 6102;
    constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleDuty;
    constexpr static ViolationType RuleViolationType = ViolationType::DUTY;

	explicit ReduceOffDutyPeriodAwayFromBaseRule(const RuleSystem* system, const InputType& input)
		: CalculateRule(system, ReduceOffDutyPeriodAwayFromBaseRule::RuleFuncId, ReduceOffDutyPeriodAwayFromBaseRule::AvailableInterface) {
		ParseParam(input);
	}

	~ReduceOffDutyPeriodAwayFromBaseRule() override = default;

	void CalculateDuty(Duty *duty) override;

	void CalculateDuty(Pairing* pairing) override;

	void CalculateDuty(std::vector<const ROSTER*>& rosters) override;
private:

	std::unique_ptr<ReduceOffDutyPeriodAwayFromBaseRuleParam> _ruleParam{ nullptr };

	void ParseParam(const InputType& input);

	void CalculateDuty(std::vector<Duty*>& duties, Duty* currDuty, const map<long long, long>& mapCallinSBY_FDPMins);

	void CalculateDuty(const Duty* firstODPBeforeDuty, Duty* firstFDPDuty, const Duty* secondFDPDuty, const Duty* thirdFDPDuty, const map<long long, long>& mapCallinSBY_FDPMins);
	bool CalculateDuty(const Duty* firstODPBeforeDuty, Duty* firstFDPDuty,
		const Duty* secondFDPDuty, const Duty* thirdFDPDuty, const std::string& base, const ReduceOffDutyPeriodAwayFromBaseRuleFirstCaseParam& ruleParam, const map<long long, long>& mapCallinSBY_FDPMins);

	void CalculateDuty(Duty* firstFDPDuty, const Duty* secondFDPDuty, const Duty* thirdFDPDuty, const map<long long, long>& mapCallinSBY_FDPMins);
	bool CalculateDuty(Duty* firstFDPDuty, const Duty* secondFDPDuty, const Duty* thirdFDPDuty, const std::string& base, const ReduceOffDutyPeriodAwayFromBaseRuleSecondCaseParam& ruleParam, const map<long long, long>& mapCallinSBY_FDPMins);

};

#endif //_REDUCEOFFDUTYPERIODAWAYFROMBASERULE_H_
