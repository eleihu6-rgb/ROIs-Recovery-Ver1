/**
 * @file CheckRestDiscretionRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckRestDiscretionRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

bool CheckRestDiscretionRule::CheckRule(const Pairing* pairing) const {
	return CheckRule(pairing->getDutyVec());
}

bool CheckRestDiscretionRule::CheckRule(const Duty* duty) const {
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	return CheckRule(duties);
}

bool CheckRestDiscretionRule::CheckRule(const vector<Duty*>& duties) const {
	if (duties.empty()) {
		return true;
	}
	if (_ruleParams.empty()) {
		return true;
	}

	std::string base; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	bool passAllRule = true;
	bool next = true;
	for (std::size_t i = 0; i < duties.size(); i++) {
		Duty* currDuty = duties.at(i);
		Duty* nextDuty = (i + 1) >= duties.size() ? nullptr : duties.at(i + 1);
		for (const auto & ruleParam : _ruleParams) {
			_ruleViolation.SetRuleParam(ruleParam);
			bool valid = CheckRule(next, currDuty, nextDuty, ruleParam, base);
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

bool CheckRestDiscretionRule::CheckRule(bool& next, const Duty* currDuty, const Duty* nextDuty, const RestDiscretionRuleParam& ruleParam, const std::string& base) const {
	bool valid = true;
	next = true;
	if (ruleParam.MatchParam(currDuty, nextDuty, base)) {
		next = false;
		RestDiscretionRuleParam::WarnCode warnCode = ruleParam.CheckParam(currDuty, nextDuty);
		if (warnCode == RestDiscretionRuleParam::WarnCode::REST_REDUCTION_WARN) {
			valid = false;
			if (currDuty->supportDiscretionType(DiscretionType::REST)) {
				_ruleViolation.SetParam("restMaxReduction", ruleParam._restMaxReduction);
			}
			else {
				_ruleViolation.SetParam("restMaxReduction", "0");
			}
			int actualRest = currDuty->getActualRest();
			_ruleViolation.SetParam("actualRest", TimeUtils::MinutesTohhmm(actualRest));
			ThrowRestDiscretioRuleViolation(currDuty);
		}
	}
	return valid;
}

void CheckRestDiscretionRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(RestDiscretionRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(RestDiscretionRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CheckRestDiscretionRule::ThrowRestDiscretioRuleViolation(const Duty* duty) const {
	string actualRest = _ruleViolation.GetParam("actualRest");
	string minRest = TimeUtils::MinutesTohhmm(duty->getLimitationValue(RULE_LIMITATION_TYPE::MIN_REST));
	string restMaxReduction = _ruleViolation.GetParam("restMaxReduction");
	std::string msg = "Actual rest ({0:actualRest}) is more than the minimum rest ({1:minRest}) and reduction rest ({2:restMaxReduction}) limitation.";
	msg = StringUtils::Format(msg, actualRest, minRest, restMaxReduction);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = CheckRestDiscretionRule::RuleFuncId;
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
		_ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, CheckRestDiscretionRule::RuleFuncId);
	}
	rv->startDTUtc = duty->getEndTimeUtcAct();
	rv->endDTUtc = duty->getEndTimeUtcAct();
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("ruleId", StringUtils::lltos(rv->idRule)));
	rv->operation_result.insert(pair<string, string>("actualRest", actualRest));
	rv->operation_result.insert(pair<string, string>("minRest", minRest));
	rv->operation_result.insert(pair<string, string>("restMaxReduction", restMaxReduction));
	_ruleViolation.AddRuleViolations(rv);
}

