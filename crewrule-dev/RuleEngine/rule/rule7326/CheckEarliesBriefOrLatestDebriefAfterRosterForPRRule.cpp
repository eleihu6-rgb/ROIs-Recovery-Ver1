/**
 * @file CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-21
**/

#include "../RuleSytem.h"
#include "CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule.h"
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


bool CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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

	for (const auto& ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		_ruleViolation.SetRuleParam(ruleParam);

		bool valid = CheckRule(rosters, ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}


bool CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters, const CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam& ruleParam) const {
	bool passAllRule = true;
	
	for (size_t i = 0; i < rosters.size(); i++) {
		const ROSTER* beforeRoster = (i == 0) ? nullptr : rosters[i - 1];
		const ROSTER* currRoster = rosters[i];
		
		if (currRoster != nullptr && !PhaseUtils::IsChecked(currRoster, ruleParam.GetPhase(), this->_dbData)) {
			continue;
		}

		int lastIndex = (int)i;
		bool next = GetConsecutiveDaysLastIndex(lastIndex, i, rosters, ruleParam);
		if (lastIndex >= 0) {
			i = lastIndex;//跳到最后一个连续天数的索引位置
		}
		if (lastIndex < 0 || !next) continue;
		if (lastIndex >= rosters.size()) break;
		

		const ROSTER* afterRoster = ((size_t)lastIndex + 1) >= rosters.size() ? nullptr : rosters[(size_t)lastIndex + 1];

        //检查最迟签出
		if (beforeRoster !=nullptr && ruleParam.MatchBeforeRosterAssignment(beforeRoster) && ruleParam.MatchBeforeRosterAssignmentGroup(beforeRoster)) {
            time_t checkoutTimeUtc = beforeRoster->actRestStrUtc;
			int offsetTZMinutes = (int)(beforeRoster->actRestStrLoc - beforeRoster->actRestStrUtc) / 60;
			if (beforeRoster->pairing != nullptr) {
				checkoutTimeUtc = beforeRoster->pairing->getLastDuty()->getLastDebrief()->getEndTimeUtcAct();
			}
            time_t checkOutDayUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(checkoutTimeUtc, offsetTZMinutes);
			time_t latestCheckoutTimeUtc = checkOutDayUtc + (time_t)ruleParam._latestDebriefBeforeRosterMinutes * 60;
			//二个Roster之间存在空白天则不检查
			if (!HasBlankDayInBetween(beforeRoster, currRoster) && checkoutTimeUtc > latestCheckoutTimeUtc) {
				ThrowRuleViolationForLatestEnd(beforeRoster, checkoutTimeUtc + offsetTZMinutes * 60, ruleParam);
				passAllRule = false;
            }
		}

		//检查最早签到时间
		if (afterRoster != nullptr && ruleParam.MatchAfterRosterAssignment(afterRoster) && ruleParam.MatchAfterRosterAssignmentGroup(afterRoster)) {
			time_t checkinTimeUtc = afterRoster->actStrUtc;
			int offsetTZMinutes = (int)(afterRoster->actStrLoc - afterRoster->actStrUtc) / 60;
			if (afterRoster->pairing != nullptr) {
				checkinTimeUtc = afterRoster->pairing->getFirstDuty()->getFirstBreif()->getStartTimeUtcAct();
			}
			time_t checkInDayUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(checkinTimeUtc, offsetTZMinutes);
			time_t earliestCheckinTimeUtc = checkInDayUtc + (time_t)ruleParam._earliestBriefAfterRosterMinutes * 60;
			//二个Roster之间存在空白天则不检查
			if (!HasBlankDayInBetween(rosters[lastIndex], afterRoster) && checkinTimeUtc < earliestCheckinTimeUtc) {
				ThrowRuleViolationForEarliestStart(afterRoster, checkinTimeUtc + offsetTZMinutes * 60, ruleParam);
				passAllRule = false;
			}
		}

	}

	return passAllRule;
}

void CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

bool CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule::GetConsecutiveDaysLastIndex(int& lastIndex, const size_t currentIndex, const std::vector<const ROSTER*>& rosters, const CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam& ruleParam) const {
	if (ruleParam._consecutiveAssignmentDays.empty() || ruleParam._consecutiveAssignmentDays == "*") {
		const ROSTER* currRoster = rosters[currentIndex];
		if (ruleParam.MatchParam(currRoster)) {
			lastIndex = (int)currentIndex;
			return true;
		}
		else {
			lastIndex = -1;
			return true;
		}
	}
	else {
		int totalConsecutiveDays = 0;//合计连续天数
		ROSTER* prevRosterInSubRoster = nullptr;
		for (int j = (int)currentIndex; j < (int)rosters.size(); j++) {
			ROSTER* currRosterInSubRoster = const_cast<ROSTER*>(rosters[j]);
			if (!ruleParam.MatchParam(currRosterInSubRoster)) {
				//不连续，进行检查
				if (totalConsecutiveDays > 0 && totalConsecutiveDays >= ruleParam._consecutiveAssignmentDaysLower && totalConsecutiveDays < ruleParam._consecutiveAssignmentDaysUpper) {
					lastIndex = j - 1;
					return true;
				}
				else {
					lastIndex = j;
					return false;
				}
			}
			int consecutiveDays = RosterUtils::GetConsecutiveDaysWithCurrRoster(prevRosterInSubRoster, currRosterInSubRoster);

			if (consecutiveDays < 0) {
				//不连续，进行检查
				if (totalConsecutiveDays >= ruleParam._consecutiveAssignmentDaysLower && totalConsecutiveDays < ruleParam._consecutiveAssignmentDaysUpper) {
					lastIndex = j - 1;
					return true;
				}
				else {
					lastIndex = j - 1;
					return false;
				}
			}
			totalConsecutiveDays += consecutiveDays;

			prevRosterInSubRoster = currRosterInSubRoster;

		}

		if (totalConsecutiveDays >= ruleParam._consecutiveAssignmentDaysLower && totalConsecutiveDays < ruleParam._consecutiveAssignmentDaysUpper) {
			lastIndex = (int)rosters.size() - 1;
			return true;
		}
		else {
			lastIndex = (int)rosters.size() - 1;
			return false;
		}
	}
	lastIndex = (int)rosters.size();
	return false;
}

bool CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule::HasBlankDayInBetween(const ROSTER* prevRoster, const ROSTER* currRoster) const {
	if (prevRoster == nullptr || currRoster == nullptr) {
		return false;
	}
	int days = TimeUtils::DiffCalendarDay(prevRoster->actRestStrLoc, currRoster->actStrLoc);
	return days > 2;
}

void CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule::ThrowRuleViolationForLatestEnd(const ROSTER* roster, const time_t checkoutTimeLoc, const CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam& ruleParam) const {
	string debriefHHmm = TimeUtils::MinutesTohhmm(TimeUtils::GetDayMinutes(checkoutTimeLoc));
	//签出时间告警（告警在前一个Roster上）：The debrief (前一天时间签出时间，HH:MM ) before the attribute (设置参数值) must be before HH:MM (Latest Debrief Before Roster设置值)
	string msg = "The end time ({0:debriefHHmm}) before the attribute ({1:pairingAttributes}) must be before {2:latestDebriefBeforeRoster}.";
	msg = StringUtils::Format(msg, debriefHHmm, ruleParam._strPairingAttributes, ruleParam._latestDebriefBeforeRoster);

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
	rv->operation_result.insert(pair<string, string>("debriefHHmm", debriefHHmm));
	rv->operation_result.insert(pair<string, string>("pairingAttributes", ruleParam._strPairingAttributes));
	rv->operation_result.insert(pair<string, string>("latestDebriefBeforeRoster", ruleParam._latestDebriefBeforeRoster));

	_ruleViolation.AddRuleViolations(rv);
}

void CheckEarliesBriefOrLatestDebriefAfterRosterForPRRule::ThrowRuleViolationForEarliestStart(const ROSTER* roster, const time_t checkinTimeLoc,  const CheckEarliesBriefOrLatestDebriefAfterRosterForPRRuleParam& ruleParam) const {
	string briefHHmm = TimeUtils::MinutesTohhmm(TimeUtils::GetDayMinutes(checkinTimeLoc));

	//签到时间告警(告警在第二个Roster上)：The brief (第二天时间签到时间，HH:MM) after the attribute(设置参数值) must be after HH:MM （Earliest Brief After Roster设置值）
	string msg = "The start time ({0:briefHHmm}) after the attribute ({1:pairingAttributes}) must be after {2:earliestBriefAfterRoster}.";
	msg = StringUtils::Format(msg, briefHHmm, ruleParam._strPairingAttributes, ruleParam._earliestBriefAfterRoster);

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
	rv->operation_result.insert(pair<string, string>("briefHHmm", briefHHmm));
	rv->operation_result.insert(pair<string, string>("pairingAttributes", ruleParam._strPairingAttributes));
	rv->operation_result.insert(pair<string, string>("earliestBriefAfterRoster", ruleParam._earliestBriefAfterRoster));

	_ruleViolation.AddRuleViolations(rv);
}