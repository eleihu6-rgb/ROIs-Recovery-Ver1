/**
 * @file LimitSwingbackForSQRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-16
**/

#include "../RuleSytem.h"
#include "LimitSwingbackForSQRule.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"

bool LimitSwingbackForSQRule::CheckRule(const Pairing* pairing) const {
	return CheckRule(pairing->getDutyVec());
}

bool LimitSwingbackForSQRule::CheckRule(const Duty* duty) const {
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	return CheckRule(duties);
}

bool LimitSwingbackForSQRule::CheckRule(const vector<Duty*>& duties) const {
	if (_ruleParams.empty()) {
		return true;
	}

	if (duties.size() < 3) {
		return true;
	}

	bool passAllRule = true;
	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);

		bool valid = CheckRule(duties, ruleParam);
		if (!valid) {
			passAllRule = false;
		}
	}
	return passAllRule;
}

bool LimitSwingbackForSQRule::CheckRule(const vector<Duty*>& duties, const LimitSwingbackForSQRuleParam& ruleParam) const {
	bool valid = true;
	int swingbackCount = 0;
	for (int i = 0; i <= static_cast<int>(duties.size()) - 3; i++) {
		auto& duty1 = duties[i];
		auto& duty2 = duties[i + 1];
		auto& duty3 = duties[i + 2];
		if (ruleParam.MatchParam(duty1, duty2, duty3)) {
			swingbackCount++;
		}
	}
	if (swingbackCount > ruleParam._maxSwingbackCount) {
		valid = false;
		ThrowRuleViolation(swingbackCount, duties[0], duties[duties.size()-1], ruleParam);
	}
	return valid;
}

void LimitSwingbackForSQRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitSwingbackForSQRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitSwingbackForSQRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitSwingbackForSQRule::ThrowRuleViolation(const int swingbackCount, const Duty* firstDuty, const Duty* lastDuty, const LimitSwingbackForSQRuleParam& ruleParam) const {
	std::string msg = "Swingback ({0:swingbackCount}) exceeds the limit ({1:maxSwingbackCount}).";
	msg = StringUtils::Format(msg, swingbackCount, ruleParam._maxSwingbackCount);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = LimitSwingbackForSQRule::RuleFuncId;
	rv->pairingId = firstDuty->getPairingId();
	rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		if (this->_dbData != nullptr) {
			const int crewIndex = _ruleViolation.GetRuleLegality()->crewIndex;
			if (crewIndex >= 0 && crewIndex < static_cast<int>(this->_dbData->crewList.size())) {
				SharedPtr<CREW> ppCrew = this->_dbData->crewList[crewIndex];
				if (ppCrew != nullptr) {
					const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, firstDuty->getPairingId());
					rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
					rv->crewId = ppCrew->idCrew;
					_ruleViolation.SetLegalityMessage(ppCrew, msg);
				}
			}
		}
	}
	else {
		_ruleViolation.SetLegalityMessage(const_cast<Duty*>(firstDuty), msg, LimitSwingbackForSQRule::RuleFuncId);
	}
	rv->startDTUtc = firstDuty->getStartTimeUtcAct();
	rv->endDTUtc = lastDuty->getEndTimeUtcAct();
	rv->violation_msg = msg;

	_ruleViolation.AddRuleViolations(rv);
}
