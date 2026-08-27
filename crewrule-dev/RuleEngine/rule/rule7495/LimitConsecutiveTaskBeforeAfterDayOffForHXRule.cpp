/**
 * @file LimitConsecutiveTaskBeforeAfterDayOffForHXRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-06-03
**/

#include <algorithm>
#include "../RuleSytem.h"
#include "LimitConsecutiveTaskBeforeAfterDayOffForHXRule.h"
#include "../utils/TimeUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "RuleParams.h"

using namespace std;

bool LimitConsecutiveTaskBeforeAfterDayOffForHXRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;

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

	SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string crewBase = crew->getPrimeBase();
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeLocSch(), crewBase, this->GetDataContext());

	for (const auto& ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		_ruleViolation.SetRuleParam(ruleParam);
		if (!CheckRule(rosters, checkedStartTime, checkedEndTime, crew, offsetTZMinutes, ruleParam)) {
			passAllRule = false;
		}
	}

	return passAllRule;
}

bool LimitConsecutiveTaskBeforeAfterDayOffForHXRule::CheckRule(const std::vector<const ROSTER*>& rosters, const time_t checkedStartTime, const time_t checkedEndTime, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const ConsecutiveTaskBeforeAfterDayOffForHXRuleParam& ruleParam) const {
	bool passAllRule = true;

	int startIndex = 0;
	while (startIndex < static_cast<int>(rosters.size())) {
		if (!ruleParam.MatchParam(rosters[startIndex])) {
			startIndex++;
			continue;
		}

		int endIndex = -1;
		int totalConsecutiveDays = GetConsecutiveAssignmentDays(endIndex, rosters, startIndex, offsetTZMinutes, ruleParam);
		if (endIndex < 0 || totalConsecutiveDays <= 0) {
			startIndex++;
			continue;
		}

		if (ruleParam._maxConsecutiveDays > 0) {
			if (totalConsecutiveDays < ruleParam._maxConsecutiveDays) {
				startIndex = endIndex + 1;
				continue;
			}
			else if (totalConsecutiveDays > ruleParam._maxConsecutiveDays) {
				//连续天数超过最大值时，前序和后续DO要求一定违规，直接告警即可
				ThrowRuleViolationForMaxConsecutiveDays(rosters[startIndex], rosters[endIndex], ruleParam);
				return false;
			}
		}
		if (ruleParam._maxConsecutiveDays <= 0 && !ruleParam.MatchConsecutiveDaysRange(totalConsecutiveDays)) {
			startIndex = endIndex + 1;
			continue;
		}

		if (!CheckPreDaysOff(rosters, startIndex, endIndex, crew, offsetTZMinutes, ruleParam)) {
			passAllRule = false;
		}

		if (!CheckPostDaysOff(rosters, startIndex, endIndex, crew, offsetTZMinutes, ruleParam)) {
			passAllRule = false;
		}

		startIndex = endIndex + 1;
	}

	return passAllRule;
}

bool LimitConsecutiveTaskBeforeAfterDayOffForHXRule::CheckPreDaysOff(const std::vector<const ROSTER*>& rosters, const int startIndex, const int endIndex, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const ConsecutiveTaskBeforeAfterDayOffForHXRuleParam& ruleParam) const {
	if (ruleParam._minPreDaysOff <= 0) {
		return true;
	}

	if (startIndex == 0) {
		return true;
	}

	auto daysOffPeriods = this->_dayOffDefinition.getPreConsecutiveDaysOffPeriods(rosters, startIndex, this->_dbData, this->_dbData->scenario.startDtUTC, this->_dbData->scenario.endDtUTC, offsetTZMinutes);
	int daysOffCount = daysOffPeriods.size();

	if (daysOffCount < ruleParam._minPreDaysOff) {
		ThrowRuleViolationForBeforeAfter(rosters[startIndex], rosters[endIndex],"PRE_DAYS_OFF", daysOffCount, ruleParam);
		return false;
	}

	return true;
}

bool LimitConsecutiveTaskBeforeAfterDayOffForHXRule::CheckPostDaysOff(const std::vector<const ROSTER*>& rosters, const int startIndex, const int endIndex, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const ConsecutiveTaskBeforeAfterDayOffForHXRuleParam& ruleParam) const {
	if (ruleParam._minPostDaysOff <= 0) {
		return true;
	}

	if (endIndex >= static_cast<int>(rosters.size()) - 1) {
		return true;
	}

	auto daysOffPeriods = this->_dayOffDefinition.getPostConsecutiveDaysOffPeriods(rosters, endIndex, this->_dbData, this->_dbData->scenario.startDtUTC, this->_dbData->scenario.endDtUTC, offsetTZMinutes);
	int daysOffCount = daysOffPeriods.size();

	if (daysOffCount < ruleParam._minPostDaysOff) {
		ThrowRuleViolationForBeforeAfter(rosters[startIndex], rosters[endIndex], "POST_DAYS_OFF", daysOffCount, ruleParam);
		return false;
	}

	return true;
}

int LimitConsecutiveTaskBeforeAfterDayOffForHXRule::GetConsecutiveAssignmentDays(int& endIndex, const std::vector<const ROSTER*>& rosters, int startIndex, const int offsetTZMinutes, const ConsecutiveTaskBeforeAfterDayOffForHXRuleParam& ruleParam) const {
	if (startIndex < 0 || startIndex >= static_cast<int>(rosters.size())) {
		endIndex = -1;
		return 0;
	}

	if (!ruleParam.MatchParam(rosters[startIndex])) {
		endIndex = -1;
		return 0;
	}

	endIndex = startIndex;
	int totalConsecutiveDays = 0;//合计连续天数
	ROSTER* prevRoster = nullptr;
	for (int i = startIndex; i < static_cast<int>(rosters.size()); i++) {
		ROSTER* currRoster = const_cast<ROSTER*>(rosters[i]);
		if (!ruleParam.MatchParam(currRoster)) {
			break;
		}
		endIndex = i;
		int consecutiveDays = RosterUtils::GetConsecutiveDaysWithCurrRoster(prevRoster, currRoster);

		if (consecutiveDays < 0) {
			return totalConsecutiveDays;
		}
		totalConsecutiveDays += consecutiveDays;
		prevRoster = currRoster;
	}

	return totalConsecutiveDays;
}

void LimitConsecutiveTaskBeforeAfterDayOffForHXRule::ThrowRuleViolationForMaxConsecutiveDays(const ROSTER* startRoster, const ROSTER* endRoster, const ConsecutiveTaskBeforeAfterDayOffForHXRuleParam& ruleParam) const {
	std::string msg;
	//连续N天的任务前面至少要有X个DDO/DO，之后至少要有Y个DDO/DO
	//The consecutive {N}-day duty does not meet the required rest days: at least {X} days off before and {Y} days off after.
	string violationType = "PRE_DAYS_OFF";
	if ((!ruleParam._strMinPreDaysOff.empty() && ruleParam._strMinPreDaysOff != "*") && (!ruleParam._strMinPostDaysOff.empty() && ruleParam._strMinPostDaysOff != "*")) {
		violationType = "ALL";
		msg = "The consecutive day ({0:consecutiveDaysRange}) duty does not meet the required days off (min {1:minPreDaysOff} before) (min {2:minPostDaysOff} after).";
		msg = StringUtils::Format(msg, ruleParam._strConsecutiveDaysRange, ruleParam._minPreDaysOff, ruleParam._minPostDaysOff);
	}
	else if (!ruleParam._strMinPreDaysOff.empty() && ruleParam._strMinPreDaysOff != "*") {
		violationType = "PRE_DAYS_OFF";
		msg = "The consecutive day ({0:consecutiveDaysRange}) duty does not meet the required days off (min {1:minPreDaysOff} before).";
		msg = StringUtils::Format(msg, ruleParam._strConsecutiveDaysRange, ruleParam._minPreDaysOff);
	}
	else if (!ruleParam._strMinPostDaysOff.empty() && ruleParam._strMinPostDaysOff != "*") {
		violationType = "POST_DAYS_OFF";
		msg = "The consecutive day ({0:consecutiveDaysRange}) duty does not meet the required days off (min {1:minPostDaysOff} after).";
		msg = StringUtils::Format(msg, ruleParam._strConsecutiveDaysRange, ruleParam._minPostDaysOff);
	}
	else {
		violationType = "ALL_ERROR";
		msg = "The consecutive day ({0:consecutiveDaysRange}) duty does not meet the required days off.";
		msg = StringUtils::Format(msg, ruleParam._strConsecutiveDaysRange);
	}

	SharedPtr<CREW> ppCrew = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex];
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = ppCrew->idCrew;
	if (violationType == "PRE_DAYS_OFF" || violationType == "ALL") {
		rv->rosterId = startRoster->rosterId;
		rv->pairingId = (startRoster->pairing != nullptr) ? startRoster->pairId : 0;
	}
	else {
		rv->rosterId = endRoster->rosterId;
		rv->pairingId = (endRoster->pairing != nullptr) ? endRoster->pairId : 0;
	}
	rv->startDTUtc = startRoster->actStrUtc;
	rv->endDTUtc = endRoster->actRestStrUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;

	rv->operation_result.insert(std::pair<std::string, std::string>("minPreDaysOff", std::to_string(ruleParam._minPreDaysOff)));
	rv->operation_result.insert(std::pair<std::string, std::string>("minPostDaysOff", std::to_string(ruleParam._minPostDaysOff)));
	rv->operation_result.insert(std::pair<std::string, std::string>("violationType", "MAX_CONSECUTIVE_DAYS"));

	_ruleViolation.AddRuleViolations(rv);
}

void LimitConsecutiveTaskBeforeAfterDayOffForHXRule::ThrowRuleViolationForBeforeAfter(const ROSTER* startRoster, const ROSTER* endRoster, const std::string& violationType, const int actualDaysOff, const ConsecutiveTaskBeforeAfterDayOffForHXRuleParam& ruleParam) const {
	std::string msg;
	//连续N天的任务前面至少要有X个DDO/DO，之后至少要有Y个DDO/DO
	//The consecutive {N}-day duty does not meet the required rest days: at least {X} days off before and {Y} days off after.
	if (violationType == "PRE_DAYS_OFF") {
		msg = "The consecutive day ({0:consecutiveDaysRange}) duty does not meet the required days off (min {1:minPreDaysOff} before).";
		msg = StringUtils::Format(msg, ruleParam._strConsecutiveDaysRange, ruleParam._minPreDaysOff);
	}
	else {
		msg = "The consecutive day ({0:consecutiveDaysRange}) duty does not meet the required days off (min {1:minPostDaysOff} after).";
		msg = StringUtils::Format(msg, ruleParam._strConsecutiveDaysRange, ruleParam._minPostDaysOff);
	}

	SharedPtr<CREW> ppCrew = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex];
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = ppCrew->idCrew;
	if (violationType == "PRE_DAYS_OFF") {
		rv->rosterId = startRoster->rosterId;
		rv->pairingId = (startRoster->pairing != nullptr) ? startRoster->pairId : 0;
	}
	else {
		rv->rosterId = endRoster->rosterId;
		rv->pairingId = (endRoster->pairing != nullptr) ? endRoster->pairId : 0;
	}
	rv->startDTUtc = startRoster->actStrUtc;
	rv->endDTUtc = endRoster->actRestStrUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(std::pair<std::string, std::string>("minPreDaysOff", std::to_string(ruleParam._minPreDaysOff)));
	rv->operation_result.insert(std::pair<std::string, std::string>("minPostDaysOff", std::to_string(ruleParam._minPostDaysOff)));
	rv->operation_result.insert(std::pair<std::string, std::string>("actualDaysOff", std::to_string(actualDaysOff)));
	rv->operation_result.insert(std::pair<std::string, std::string>("violationType", violationType));

	_ruleViolation.AddRuleViolations(rv);
}

void LimitConsecutiveTaskBeforeAfterDayOffForHXRule::ParseParam(const InputType& input) {
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(ConsecutiveTaskBeforeAfterDayOffForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

	auto it = input.dependDbRules.find(RULES::ANR_DAY_OFF_DEFINITION);
	if (it != input.dependDbRules.end()) {
		_dayOffDefinition.loadFromDbRules(it->second);
	}

	if (!_ruleParams.empty()) {
		return;
	}

	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(ConsecutiveTaskBeforeAfterDayOffForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}