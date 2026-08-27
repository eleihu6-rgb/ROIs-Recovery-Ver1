#pragma once
#ifndef _CHECKCOFMULTIPLEQUALSFORTGRULE_H_
#define _CHECKCOFMULTIPLEQUALSFORTGRULE_H_

#include <string>
#include "../BasicRule.h"
#include "../RuleInput.h"
#include "../RuleSystemDefine.h"
#include "../violationcollector/ViolationTypeDefine.h"
#include "CheckCOFMultipleQualsForTGRuleParam.h"

class CheckCOFMultipleQualsForTGRule : public BasicRule {
public:
	using InputType = RuleInput;
	constexpr static unsigned int RuleFuncId = 7013;
	constexpr static RuleInterface::InterfaceUnderlyingType AvailableInterface = RuleInterface::Interface::SingleCrew;
	constexpr static ViolationType RuleViolationType = ViolationType::PAIRING;

	explicit CheckCOFMultipleQualsForTGRule(const RuleSystem* system, const InputType& input)
		: BasicRule(system, CheckCOFMultipleQualsForTGRule::RuleFuncId, CheckCOFMultipleQualsForTGRule::AvailableInterface) {
		ParseParam(input);
	}
	~CheckCOFMultipleQualsForTGRule() override = default;

	bool CheckRule(const std::vector<const ROSTER*>& rosters) const override;

private:

	bool MatchCrewQual(std::vector<std::string> &quals, int qualIdx, std::vector<std::string> &visitedCrewIds, std::unordered_map<std::string, std::vector<std::string>> &crewQuals, int needQualNum) const ;

	bool isStartWithDigit(string str) const;

	std::vector<CheckCOFMultipleQualsForTGRuleParam> _ruleParams;

	void ParseParam(const InputType& input);

	void ThrowRuleViolation() const;

};

#endif //_CHECKCOFMULTIPLEQUALSFORTGRULE_H_
