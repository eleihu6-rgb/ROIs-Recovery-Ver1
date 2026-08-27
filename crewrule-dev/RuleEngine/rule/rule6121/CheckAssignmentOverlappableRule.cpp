/**
 * @file CheckAssignmentOverlappableRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckAssignmentOverlappableRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../period/RestPeriod.h"

bool CheckAssignmentOverlappableRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParam == nullptr || this->_ruleParam->Empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
	if (rosters.size() == 1) {
		return true;
	}

	const auto& crew = this->GetDataContext()->crewIdMap[rosters[0]->idcrew];
	_ruleViolation.SetRuleParam(*_ruleParam);

	// Iterate adjacent rosters and only evaluate overlapping activities.
	for (size_t i = 0; i < rosters.size() - 1; i++) {
		const auto& currentRoster = rosters[i];
		const auto& nextRoster = rosters[i + 1];
		if (currentRoster->actEndUtc <= nextRoster->actStrUtc) {
			continue;
		}

		string assign1 = currentRoster->qualifier;
		string assign2 = nextRoster->qualifier;

		// If the next roster starts after the previous activity's rest starts, compare against RST.
		if (currentRoster->actRestStrUtc < nextRoster->actStrUtc) {
			assign1 = "RST";
		}

		if (!_ruleParam->MatchAssignmentOverlappable(assign1, assign2)) {
			if (this->_application == ROSTER_OPTIMIZER) {
				return false;
			}
			_ruleViolation.SetParam("start", to_string(nextRoster->actStrUtc));
			_ruleViolation.SetParam("end", to_string(currentRoster->actRestStrUtc));
			_ruleViolation.SetParam("prevAssignment", assign1);
			_ruleViolation.SetParam("nextAssignment", assign2);
			_ruleViolation.SetParam("rosterId", to_string(nextRoster->rosterId));
			_ruleViolation.SetParam("pairingId", to_string(nextRoster->pairId));
			ThrowRuleViolation();
			passAllRule = false;
		}

		if (_ruleParam->OnlyCheckFirstParam()) {
			continue;
		}

		for (const auto& secondRuleParam : _ruleParam->_secondCaseParams) {
			if (!secondRuleParam.MatchCrewQualification(crew, nextRoster->actStrUtc, nextRoster->actEndUtc)) {
				continue;
			}

			if (!secondRuleParam.MatchAssignment(currentRoster->qualifier, "PREV")
				|| !secondRuleParam.MatchTraining(currentRoster, "PREV")) {
				continue;
			}

			if (!secondRuleParam.MatchAssignment(nextRoster->qualifier, "NEXT")
				|| !secondRuleParam.MatchTraining(nextRoster, "NEXT")) {
				continue;
			}

			if (this->_application == ROSTER_OPTIMIZER) {
				return false;
			}
			_ruleViolation.SetParam("start", to_string(nextRoster->actStrUtc));
			_ruleViolation.SetParam("end", to_string(currentRoster->actRestStrUtc));
			_ruleViolation.SetParam("prevAssignment", currentRoster->qualifier);
			_ruleViolation.SetParam("nextAssignment", nextRoster->qualifier);
			_ruleViolation.SetParam("rosterId", to_string(nextRoster->rosterId));
			_ruleViolation.SetParam("pairingId", to_string(nextRoster->pairId));
			ThrowRuleViolation();
		}
	}
	return passAllRule;
}

void CheckAssignmentOverlappableRule::ParseParam(const InputType& input) {
	if (_ruleParam == nullptr) {
		_ruleParam.reset(new CheckAssignmentOverlappableRuleParam(this));
	}
	for (const auto& dbRule : input.dbRules) {
		_ruleParam->ParseParam(dbRule);
	}
	if (_ruleParam != nullptr && !_ruleParam->Empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParam->ParseParam(singleRuleParamString);
	}
}

void CheckAssignmentOverlappableRule::ThrowRuleViolation() const {
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	const string prevAssignment = _ruleViolation.GetParam("prevAssignment");
	const string nextAssignment = _ruleViolation.GetParam("nextAssignment");
	long long rosterId = stoll(_ruleViolation.GetParam("rosterId"));
	long long pairingId = stoll(_ruleViolation.GetParam("pairingId"));

	string msg = "{0:prevAssignment} and {1:nextAssignment} are not allowed to overlap.";
	msg = StringUtils::Format(msg, prevAssignment, nextAssignment);

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->pairingId = std::stoll(_ruleViolation.GetParam("pairingId"));
	rv->rosterId = rosterId;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;

	_ruleViolation.AddRuleViolations(rv);
}
