/**
 * @file CheckRestForLateArrivalOrEarlyStartRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckRestForLateArrivalOrEarlyStartRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

bool CheckRestForLateArrivalOrEarlyStartRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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
		for (int i = 0; i < (int)rosters.size() - 1; i++) {
			auto currRoster = rosters[i];
			auto nextRoster = rosters[i+1];
			bool valid = CheckRule(currRoster, nextRoster, ruleParam);
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


bool CheckRestForLateArrivalOrEarlyStartRule::CheckRule(const ROSTER* currRoster, const ROSTER* nextRoster, const RestForLateArrivalOrEarlyStartRuleParam& ruleParam) const {
	//TODO
	bool valid = true;
	//忽略预占告警
	if (this->_application == ROSTER_OPTIMIZER && currRoster->source == "PA" && nextRoster->source == "PA")
		return true;
	if (ruleParam.MatchParam(currRoster, nextRoster)) {

		int warnCode = ruleParam.CheckParam(currRoster, nextRoster);

		if ((warnCode & (int)RestForLateArrivalOrEarlyStartRuleParam::WarnCode::MIN_GAP_BETWEEN_ROSTERS_WARN) == (int)RestForLateArrivalOrEarlyStartRuleParam::WarnCode::MIN_GAP_BETWEEN_ROSTERS_WARN) {
			valid = false;
			_ruleViolation.SetParam("minGapBetweenRosters", ruleParam._minGapBetweenRosters);
			ThrowMinGapBetweenRostersRuleViolation(currRoster, nextRoster);
		}
		if ((warnCode & (int)RestForLateArrivalOrEarlyStartRuleParam::WarnCode::NEXT_ROSTER_SHOULD_NOT_BEFORE_TIME_WARN) == (int)RestForLateArrivalOrEarlyStartRuleParam::WarnCode::NEXT_ROSTER_SHOULD_NOT_BEFORE_TIME_WARN) {
			valid = false;
			_ruleViolation.SetParam("nextRosterShouldNotBeforeTime", ruleParam._nextRosterShouldNotBeforeTime);
			ThrowNextRosterShouldNotBeforeTimeRuleViolation(currRoster, nextRoster);
		}

	}
	return valid;
}

void CheckRestForLateArrivalOrEarlyStartRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(RestForLateArrivalOrEarlyStartRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(RestForLateArrivalOrEarlyStartRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void CheckRestForLateArrivalOrEarlyStartRule::ThrowMinGapBetweenRostersRuleViolation(const ROSTER* currRoster, const ROSTER* nextRoster) const {
	string minGapBetweenRosters = _ruleViolation.GetParam("minGapBetweenRosters");

	std::string msg = "Gap between rosters is less than the minimum required {0:minGapBetweenRosters}.";
	msg = StringUtils::Format(msg, minGapBetweenRosters);
	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = currRoster->rosterId;
	rv->pairingId = currRoster->pairing == nullptr ? -1 : currRoster->pairId;
	rv->startDTUtc = currRoster->getStartTimeUtcAct();
	rv->endDTUtc = currRoster->getRestStartUtcAct();
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	_ruleViolation.AddRuleViolations(rv);
}

void CheckRestForLateArrivalOrEarlyStartRule::ThrowNextRosterShouldNotBeforeTimeRuleViolation(const ROSTER* currRoster, const ROSTER* nextRoster) const {
	string nextRosterShouldNotBeforeTime = _ruleViolation.GetParam("nextRosterShouldNotBeforeTime");

	std::string msg = "Next roster is not allowed to start before {0:nextRosterShouldNotBeforeTime}.";
	msg = StringUtils::Format(msg, nextRosterShouldNotBeforeTime);
	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = currRoster->rosterId;
	rv->pairingId = currRoster->pairing == nullptr ? -1 : currRoster->pairId;
	rv->startDTUtc = currRoster->getStartTimeUtcAct();
	rv->endDTUtc = currRoster->getRestStartUtcAct();
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	_ruleViolation.AddRuleViolations(rv);
}
