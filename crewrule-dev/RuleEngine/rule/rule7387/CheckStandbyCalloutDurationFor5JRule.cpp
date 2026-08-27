/**
 * @file CheckStandbyCalloutDurationFor5JRule.cpp
 * @brief
 * @author OpenAI
 * @version 1.0
 * @date 2026-05-21
**/

#include "../RuleSytem.h"
#include "CheckStandbyCalloutDurationFor5JRule.h"
#include "../utils/StringUtils.h"

bool CheckStandbyCalloutDurationFor5JRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.size() < 2) {
		return true;
	}

	bool passAllRule = true;
	_ruleViolation.SetParam("crew_id", rosters.front()->idcrew);

	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);

		for (size_t i = 0; i + 1 < rosters.size(); ++i) {
			const auto* standbyRoster = rosters[i];
			const auto* flyRoster = rosters[i + 1];

			if (!ruleParam.MatchStandbyAssignmentGroups(standbyRoster)) {
				continue;
			}

			if (!ruleParam.MatchCallOutAssignments(flyRoster->qualifier)) {
				continue;
			}

			if (!ruleParam.MatchMergedStandbyCallout(standbyRoster, flyRoster)) {
				continue;
			}

			if (!ruleParam.CheckMaxDuration(standbyRoster, flyRoster)) {
				_ruleViolation.SetParam("max_duration", ruleParam._maxDuration);
				_ruleViolation.SetParam("roster_id", std::to_string(standbyRoster->rosterId));
				ThrowRuleViolation(standbyRoster, flyRoster, ruleParam);
				passAllRule = false;
			}
		}
	}

	return passAllRule;
}

void CheckStandbyCalloutDurationFor5JRule::ThrowRuleViolation(const ROSTER* standbyRoster, const ROSTER* flyRoster, const CheckStandbyCalloutDurationFor5JRuleParam& ruleParam) const {
	const std::string maxDuration = _ruleViolation.GetParam("max_duration");
	std::string msg = "Standby callout duration has exceeded the maximum limit({0:max_duration}).";
	msg = StringUtils::Format(msg, maxDuration);

	SharedPtr<CREW> ppCrew = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex];
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

	const std::string strEndDTUtc = _ruleViolation.GetParam("dutyEnd");

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = standbyRoster->rosterId;
	rv->pairingId = (flyRoster && flyRoster->pairing != nullptr) ? flyRoster->pairId : standbyRoster->pairId;
	rv->startDTUtc = standbyRoster->actStrUtc;
	if (strEndDTUtc.empty()) {
		rv->endDTUtc = (flyRoster && flyRoster->pairing != nullptr && flyRoster->pairing->getFirstDuty() != nullptr)
			? flyRoster->pairing->getFirstDuty()->getEndTimeUtcAct()
			: standbyRoster->actRestStrUtc;
	}
	else {
		rv->endDTUtc = atoll(strEndDTUtc.c_str());
	}
	
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(std::pair<std::string, std::string>("max_duration", maxDuration));

	_ruleViolation.AddRuleViolations(rv);
}

void CheckStandbyCalloutDurationFor5JRule::ParseParam(const InputType& input) {
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckStandbyCalloutDurationFor5JRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

	if (!_ruleParams.empty()) {
		return;
	}

	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckStandbyCalloutDurationFor5JRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}
