/**
 * @file CheckCrewOperatingRecencyRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckCrewOperatingRecencyRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

bool CheckCrewOperatingRecencyRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
	if (rosters.empty()) {
		return true;
	}
	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}

	for (const auto & ruleParam : _ruleParams) {

		std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		_ruleViolation.SetRuleParam(ruleParam);
		_ruleViolation.SetParam("maxDaysSinceLastOperating", StringUtils::itos(ruleParam._maxDaysSinceLastOperating));
		_ruleViolation.SetParam("operFleets", ruleParam._strOperFleets);
		_ruleViolation.SetParam("operAirports", ruleParam._strOperAirports);
		for (auto roster : rosters) {
			if (this->_application == ROSTER_OPTIMIZER && roster->source == "PA") {
				continue;
			}
			bool valid = CheckRule(roster, ruleParam);
			if (!valid) {
				passAllRule = false;
				if (!IsCheckAllRule()) {
					return passAllRule;
				}
			}
		}
	}
	return passAllRule;
}


bool CheckCrewOperatingRecencyRule::CheckRule(const ROSTER* roster, const CrewOperatingRecencyRuleParam& ruleParam) const {
	bool valid = true;
	if (ruleParam.MatchParam(roster)) {
		int warnCode = ruleParam.CheckRule(roster);

		if ((warnCode & (int)CrewOperatingRecencyRuleParam::WarnCode::MAX_DAYS_SINCE_LAST_OPERATING_WARN) == (int)CrewOperatingRecencyRuleParam::WarnCode::MAX_DAYS_SINCE_LAST_OPERATING_WARN) {
			valid = false;
			ThrowLastOperatingRuleViolation(roster);
		}

		if ((warnCode & (int)CrewOperatingRecencyRuleParam::WarnCode::NO_OPERATING_FLEETS_WARN) == (int)CrewOperatingRecencyRuleParam::WarnCode::NO_OPERATING_FLEETS_WARN) {
			valid = false;
			ThrowLastFleetRuleViolation(roster);
		}
		
		if ((warnCode & (int)CrewOperatingRecencyRuleParam::WarnCode::NO_OPERATING_AIRPORTS_WARN) == (int)CrewOperatingRecencyRuleParam::WarnCode::NO_OPERATING_AIRPORTS_WARN) {
			valid = false;
			ThrowLastAirportRuleViolation(roster);
		}
	}
	return valid;
}

void CheckCrewOperatingRecencyRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CrewOperatingRecencyRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CrewOperatingRecencyRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CheckCrewOperatingRecencyRule::ThrowLastOperatingRuleViolation(const ROSTER* roster) const {
	string maxDaysSinceLastOperating = _ruleViolation.GetParam("maxDaysSinceLastOperating");

	std::string msg = "Crew has not operated any flights in the past {0:maxDaysSinceLastOperating} days (excluding today).";
	msg = StringUtils::Format(msg, maxDaysSinceLastOperating);
	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = roster->rosterId;
	rv->pairingId = roster->pairing == nullptr ? -1 : roster->pairId;
	rv->startDTUtc = roster->getStartTimeUtcAct();
	rv->endDTUtc = roster->getRestStartUtcAct();
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	_ruleViolation.AddRuleViolations(rv);
}

void CheckCrewOperatingRecencyRule::ThrowLastFleetRuleViolation(const ROSTER* roster) const {
	string maxDaysSinceLastOperating = _ruleViolation.GetParam("maxDaysSinceLastOperating");
	string operFleets = _ruleViolation.GetParam("operFleets");

	std::string msg = "Crew has not operated {0:operFleets} fleet types in the past {1:maxDaysSinceLastOperating} days (excluding today).";
	msg = StringUtils::Format(msg, operFleets, maxDaysSinceLastOperating);
	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = roster->rosterId;
	rv->pairingId = roster->pairing == nullptr ? -1 : roster->pairId;
	rv->startDTUtc = roster->getStartTimeUtcAct();
	rv->endDTUtc = roster->getRestStartUtcAct();
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	_ruleViolation.AddRuleViolations(rv);
}

void CheckCrewOperatingRecencyRule::ThrowLastAirportRuleViolation(const ROSTER* roster) const {
	string maxDaysSinceLastOperating = _ruleViolation.GetParam("maxDaysSinceLastOperating");
	string operAirports = _ruleViolation.GetParam("operAirports");

	string msg = "Crew has not operated into {0:operAirports} airports in the past {1:maxDaysSinceLastOperating} days (excluding today).";
	msg = StringUtils::Format(msg, operAirports, maxDaysSinceLastOperating);
	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = roster->rosterId;
	rv->pairingId = roster->pairing == nullptr ? -1 : roster->pairId;
	rv->startDTUtc = roster->getStartTimeUtcAct();
	rv->endDTUtc = roster->getRestStartUtcAct();
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	_ruleViolation.AddRuleViolations(rv);
}