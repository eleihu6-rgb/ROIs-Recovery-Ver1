/**
 * @file CheckFdpAndFtDiscretionForCCRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckFdpAndFtDiscretionForCCRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

bool CheckFdpAndFtDiscretionForCCRule::CheckRule(const Pairing* pairing) const {
	return CheckRule(pairing->getDutyVec());
}

bool CheckFdpAndFtDiscretionForCCRule::CheckRule(const Duty* duty) const {
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	return CheckRule(duties);
}

bool CheckFdpAndFtDiscretionForCCRule::CheckRule(const vector<Duty*>& duties) const {
	if (duties.empty()) {
		return true;
	}
	if (_ruleParams.empty()) {
		return true;
	}
	bool passAllRule = true;
	bool next = true;
	Duty *prevDuty = nullptr;
	for (auto& duty : duties) {
		for (const auto & ruleParam : _ruleParams) {
			_ruleViolation.SetRuleParam(ruleParam);
			bool valid = CheckRule(next, prevDuty, duty, ruleParam);
			prevDuty = duty;
			if (!valid) {
				passAllRule = false;
			}
			if (!next) {
				break;
			}
		}
	}
	return passAllRule;
}

bool CheckFdpAndFtDiscretionForCCRule::CheckRule(bool& next, const Duty* prevDuty, const Duty* currDuty, const FdpAndFtDiscretionForCCRuleParam& ruleParam) const {
	bool valid = true;
	if (ruleParam.MatchParam(prevDuty, currDuty)) {
		int warnCode = ruleParam.CheckParam(*currDuty);
		if ((warnCode & (int)FdpAndFtDiscretionForCCRuleParam::WarnCode::FDP_EXTENSION_WARN)  == (int)FdpAndFtDiscretionForCCRuleParam::WarnCode::FDP_EXTENSION_WARN) {
			valid = false;
			if (currDuty->supportDiscretionType(DiscretionType::FDP)) {
				_ruleViolation.SetParam("fdpMaxExtension", ruleParam._fdpMaxExtension);
			}
			else {
				_ruleViolation.SetParam("fdpMaxExtension", "0");
			}
			ThrowFdpDiscretioRuleViolation(currDuty);
		}
		if ((warnCode & (int)FdpAndFtDiscretionForCCRuleParam::WarnCode::FT_EXTENSION_WARN) == (int)FdpAndFtDiscretionForCCRuleParam::WarnCode::FT_EXTENSION_WARN) {
			valid = false;
			if (currDuty->supportDiscretionType(DiscretionType::FT)) {
				_ruleViolation.SetParam("ftMaxExtension", ruleParam._ftMaxExtension);
			}
			else {
				_ruleViolation.SetParam("ftMaxExtension", "0");
			}
			ThrowFdpDiscretioRuleViolation(currDuty);
		}
		next = true;
	}
	return valid;
}

void CheckFdpAndFtDiscretionForCCRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(FdpAndFtDiscretionForCCRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(FdpAndFtDiscretionForCCRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CheckFdpAndFtDiscretionForCCRule::ThrowFdpDiscretioRuleViolation(const Duty* duty) const {
	string currFDP = TimeUtils::MinutesTohhmm(duty->getFDPInSecs() / 60);
	string maxFDP = TimeUtils::MinutesTohhmm(duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP));
	string fdpMaxExtension = _ruleViolation.GetParam("fdpMaxExtension");
	std::string msg = "Flight duty period ({0:currFDP}) is more than the maximum FDP ({1:maxFDP}) and extension FDP ({2:fdpMaxExtension}) limitation.";
	msg = StringUtils::Format(msg, currFDP, maxFDP, fdpMaxExtension);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = CheckFdpAndFtDiscretionForCCRule::RuleFuncId;
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySegNum();
	rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, duty->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
	}
	else {
		_ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, CheckFdpAndFtDiscretionForCCRule::RuleFuncId);
	}
	rv->startDTUtc = duty->getEndTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct();
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("currFDP", currFDP));
	rv->operation_result.insert(pair<string, string>("maxFDP", maxFDP));
	rv->operation_result.insert(pair<string, string>("fdpMaxExtension", fdpMaxExtension));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckFdpAndFtDiscretionForCCRule::ThrowFtDiscretioRuleViolation(const Duty* duty) const {
	string currFT = TimeUtils::MinutesTohhmm(const_cast<Duty*>(duty)->getBLKInMins());
	string maxFT = TimeUtils::MinutesTohhmm(duty->getLimitationValue(RULE_LIMITATION_TYPE::MAX_BLOCK));
	string ftMaxExtension = _ruleViolation.GetParam("ftMaxExtension");
	std::string msg = "Flight time ({0:currFT}) is more than the maximum FT ({1:maxFT}) and extension FT ({2:ftMaxExtension}) limitation.";
	msg = StringUtils::Format(msg, currFT, maxFT, ftMaxExtension);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = CheckFdpAndFtDiscretionForCCRule::RuleFuncId;
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySegNum();
	rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, duty->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
	}
	else {
		_ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, CheckFdpAndFtDiscretionForCCRule::RuleFuncId);
	}
	rv->startDTUtc = duty->getEndTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct();
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("currFT", currFT));
	rv->operation_result.insert(pair<string, string>("maxFT", maxFT));
	rv->operation_result.insert(pair<string, string>("ftMaxExtension", ftMaxExtension));
	_ruleViolation.AddRuleViolations(rv);
}