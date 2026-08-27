/**
 * @file LimitMaxConsecutiveDutyTimesForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-08-07
**/

#include "../RuleSytem.h"
#include "LimitMaxConsecutiveDutyTimesForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/PhaseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/CrewRpRecencyIndex.h"

bool LimitMaxConsecutiveDutyTimesForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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

	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string crewBase = crew->getPrimeBase();
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeLocSch(), crewBase, this->GetDataContext());
	string weekdayStartFrom = this->_dbData->getWeekdayStartFrom();
	for (const auto & ruleParam : _ruleParams) {

		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}

		_ruleViolation.SetRuleParam(ruleParam);

		bool valid = CheckRule(rosters, crew, offsetTZMinutes, ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}


bool LimitMaxConsecutiveDutyTimesForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitMaxConsecutiveDutyTimesForPRRuleParam& ruleParam) const {
	bool valid = true;

	int totalConsecutiveTimesOrDays = 0;//合计连续次数
	ROSTER* prevRoster = nullptr;
	std::vector<const ROSTER*> subRosters;//记录满足Assignment和Attribute匹配条件Roster的连续集合
	for (size_t i = 0; i < rosters.size(); i++) {
		auto currRoster = const_cast<ROSTER*>(rosters[i]);
		if (currRoster != nullptr && !PhaseUtils::IsChecked(currRoster, ruleParam.GetPhase(), this->_dbData)) {
			totalConsecutiveTimesOrDays = 0;//重新累计连续天
			prevRoster = nullptr;
			subRosters.clear();
			continue;
		}

		if (!ruleParam.MatchParam(currRoster)) {
			//不连续，检查是否满足Roster之间休息间隔时长要求
			if (totalConsecutiveTimesOrDays > ruleParam._maxConsecutiveTimes) {
				valid = false;
				ThrowRuleViolation(subRosters.front(), subRosters.front()->actStrUtc, subRosters.back()->actRestStrUtc, totalConsecutiveTimesOrDays, ruleParam);
				if (!this->IsCheckAllRule()) {
					return valid;
				}
			}

			totalConsecutiveTimesOrDays = 0;//重新累计连续天
			prevRoster = nullptr;
			subRosters.clear();
			continue;
		}
		int consecutiveTimesOrDays = GetConsecutiveTimesOrDaysWithCurrRoster(prevRoster, currRoster, ruleParam);
		if (consecutiveTimesOrDays < 0) {
			//不连续，检查是否满足Roster之间休息间隔时长要求
			if (totalConsecutiveTimesOrDays > ruleParam._maxConsecutiveTimes) {
				valid = false;
				ThrowRuleViolation(subRosters.front(), subRosters.front()->actStrUtc, subRosters.back()->actRestStrUtc, totalConsecutiveTimesOrDays, ruleParam);
				if (!this->IsCheckAllRule()) {
					return valid;
				}
			}
			totalConsecutiveTimesOrDays = 0;//重新累计连续天
			prevRoster = nullptr;
			subRosters.clear();
			i--;
			continue;
		}
		subRosters.emplace_back(currRoster);
		totalConsecutiveTimesOrDays += consecutiveTimesOrDays;
		prevRoster = const_cast<ROSTER*>(rosters[i]);
	}

	if (totalConsecutiveTimesOrDays > ruleParam._maxConsecutiveTimes) {
		valid = false;
		ThrowRuleViolation(subRosters.front(), subRosters.front()->actStrUtc, subRosters.back()->actRestStrUtc, totalConsecutiveTimesOrDays, ruleParam);
		if (!this->IsCheckAllRule()) {
			return valid;
		}
	}
	return valid;
}

int LimitMaxConsecutiveDutyTimesForPRRule::GetConsecutiveTimesOrDaysWithCurrRoster(const ROSTER* prevRoster, const ROSTER* currRoster, const LimitMaxConsecutiveDutyTimesForPRRuleParam& ruleParam) const {
	int consecutiveTimes = -1;
	if (ruleParam._consecutiveType == "D") {
		consecutiveTimes = RosterUtils::GetConsecutiveDaysWithCurrRoster(prevRoster, currRoster);
	}
	else {
		consecutiveTimes = RosterUtils::GetConsecutiveTimesWithCurrRoster(prevRoster, currRoster);
	}
	return consecutiveTimes;
}

void LimitMaxConsecutiveDutyTimesForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitMaxConsecutiveDutyTimesForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitMaxConsecutiveDutyTimesForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitMaxConsecutiveDutyTimesForPRRule::ThrowRuleViolation(const ROSTER* roster, const time_t checkedStartTimeUtc, const time_t checkedEndTimeUtc, const int numberOfRoster, const LimitMaxConsecutiveDutyTimesForPRRuleParam& ruleParam) const {
	//在执行连续任务时，实际休息时长小于最小休息时长。
	string msg = "The number of consecutive rosters ({0:numberOfRoster}) with the specified attribute ({1:pairingAttributes}) or label ({2:pairingLabels}) must be less than {3:iMax}.";
	if (ruleParam._consecutiveType == "D") {
		//The number of consecutive roster days (实际值) with the specified attribute (设置值) or label (设置值) exceeds the threshold (设置值).
		msg = "The number of consecutive roster days ({0:numberOfRoster}) with the specified attribute ({1:pairingAttributes}) or label ({2:pairingLabels}) exceeds the threshold ({3:maxConsecutiveTimes}).";
	}
    else if (ruleParam._consecutiveType == "T") {
		//The number of consecutive rosters (实际值) with the attribute (设置值) or label (设置值) exceeds the threshold (设置值)
		msg = "The number of consecutive rosters ({0:numberOfRoster}) with the attribute ({1:pairingAttributes}) or label ({2:pairingLabels}) exceeds the threshold ({3:maxConsecutiveTimes})";
	}
	msg = StringUtils::Format(msg, numberOfRoster, ruleParam._strPairingAttributes, ruleParam._strPairingLabels, ruleParam._maxConsecutiveTimes);
	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = roster->rosterId;
	rv->pairingId = roster->pairing == nullptr ? -1 : roster->pairId;
	rv->startDTUtc = checkedStartTimeUtc;
	rv->endDTUtc = checkedEndTimeUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("numberOfRoster", StringUtils::itos(numberOfRoster)));
	rv->operation_result.insert(pair<string, string>("maxConsecutiveTimes", StringUtils::itos(ruleParam._maxConsecutiveTimes)));
	_ruleViolation.AddRuleViolations(rv);
}