/**
 * @file CheckMaxDurationFromStandbyToFlightDutyEndForHXRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-26
**/

#include "../RuleSytem.h"
#include "CheckMaxDurationFromStandbyToFlightDutyEndForHXRule.h"
#include "Utility.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TimeUtils.h"
#include "../period/BaseActivityPeriod.h"

bool CheckMaxDurationFromStandbyToFlightDutyEndForHXRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
	if (rosters.empty()) {
		return true;
	}

	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string crewBase = crew->getPrimeBase();
	_ruleViolation.SetParam("crew_id", crew->idCrew);
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeLocSch(), crewBase, this->GetDataContext());
	for (const auto& ruleParam : _ruleParams) {
		_ruleViolation.SetRuleParam(ruleParam);
		
		for (size_t i = 0; i < rosters.size() - 1; i++) {
			if (!ruleParam.MatchStandbyAssignmentGroups(rosters[i]))
				continue;
			
			if (!ruleParam.MatchStandbyAssignments(rosters[i]->qualifier))
				continue;

			if (!ruleParam.MatchFlightTimeInPlannedStandby(rosters[i], rosters[i + 1]))
				continue;

			if (!ruleParam.MatchCallOutToFlightGap(rosters[i], rosters[i + 1]))
				continue;

			if (!ruleParam.CheckMaxDurationFromStandbyToFlightDutyEnd(rosters[i], rosters[i + 1])) {
				_ruleViolation.SetParam("max_duration", ruleParam._maxDurationFromStandbyToFlightDutyEnd);
				_ruleViolation.SetParam("roster_id", to_string(rosters[i]->rosterId));
				ThrowRuleViolation(rosters[i]);
			}
		}
	}
	return passAllRule;
}

void CheckMaxDurationFromStandbyToFlightDutyEndForHXRule::ThrowRuleViolation(const ROSTER* roster) const {
	string max_duration = _ruleViolation.GetParam("max_duration");
	string crew_id = _ruleViolation.GetParam("crew_id");
	string roster_id = _ruleViolation.GetParam("roster_id");
	//红眼任务的最大实际FDP超过需求
	string msg = "Standby duration has exceeded the maximum limit({0:max_duration}).";
	msg = StringUtils::Format(msg, max_duration);

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = roster->rosterId;
	rv->pairingId = roster->pairing == nullptr ? -1 : roster->pairId;
	rv->startDTUtc = roster->actStrUtc;
	rv->endDTUtc = roster->actRestStrUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("max_duration", max_duration));

	_ruleViolation.AddRuleViolations(rv);
}

void CheckMaxDurationFromStandbyToFlightDutyEndForHXRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckMaxDurationFromStandbyToFlightDutyEndForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckMaxDurationFromStandbyToFlightDutyEndForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}
