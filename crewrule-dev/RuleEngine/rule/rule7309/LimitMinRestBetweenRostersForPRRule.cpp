/**
 * @file LimitMinRestBetweenRostersForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "LimitMinRestBetweenRostersForPRRule.h"
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
#include <climits>

bool LimitMinRestBetweenRostersForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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

//判断currRoster是不是SBY并且被抓飞
inline static bool IsSBYAndCallout(const ROSTER* currRoster, const ROSTER* nextRoster) {
	if (nextRoster == nullptr) {
		return false;
	}
	return nextRoster->callinSBY_FDPMins > 0;
}

bool LimitMinRestBetweenRostersForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitMinRestBetweenRostersForPRRuleParam& ruleParam) const {
	bool passAllRule = true;
	ROSTER* prevWorkRoster = nullptr;//组成连续Roster列表 前一个工作Roster
	for (size_t i = 0; i < rosters.size(); i++) {
		int totalConsecutiveTimesOrDays = 0;//合计连续次数
		std::vector<const ROSTER*> subRosters;//记录满足Assignment和Attribute匹配条件Roster的连续集合
		ROSTER* prevRosterInSubRoster = nullptr;//满足匹配条件的前一个Roster
		size_t j = i;
		for (; j < rosters.size(); j++) {
			auto currRosterInSubRoster = const_cast<ROSTER*>(rosters[j]);
			if (currRosterInSubRoster != nullptr && !PhaseUtils::IsChecked(currRosterInSubRoster, ruleParam.GetPhase(), this->_dbData)) {
				totalConsecutiveTimesOrDays = 0;
				subRosters.clear();

				ROSTER* tmpNextRoster = ((j + 1) == rosters.size()) ? nullptr : const_cast<ROSTER*>(rosters[j + 1]);
				if (!IsRestAssignment(currRosterInSubRoster, ruleParam) && !IsSBYAndCallout(currRosterInSubRoster, tmpNextRoster)) {
					prevWorkRoster = const_cast<ROSTER*>(currRosterInSubRoster);
				}
				continue;
			}

			if (!ruleParam.MatchParam(currRosterInSubRoster)) {
				//不连续，进行检查
				if (ruleParam.MatchConsecutiveTimesOrDays(-1, totalConsecutiveTimesOrDays)) {
					//检查是否满足Roster之间休息间隔时长要求
					int workRosterIndex = GetNextWorkRosterIndex(prevRosterInSubRoster, rosters, j, ruleParam);
					auto nextWorkRoster = workRosterIndex < 0 ? nullptr : rosters[workRosterIndex]; //组成连续Roster列表 后一个Roster
					auto actRestTimes = GetRestBetweenRosters(prevWorkRoster, nextWorkRoster, subRosters, offsetTZMinutes, ruleParam);
					for (auto& [restStartTimeUtc, restEndTimeUtc] : actRestTimes) {
						if (!CheckRule(restStartTimeUtc, restEndTimeUtc, offsetTZMinutes, ruleParam)) {
							passAllRule = false;
							ThrowRuleViolation(currRosterInSubRoster, restStartTimeUtc, restEndTimeUtc, ruleParam);
							if (!this->IsCheckAllRule()) {
								return passAllRule;
							}
						}
					}
				}
				i = j;
				break;
			}
			
			int consecutiveTimesOrDays = GetConsecutiveTimesOrDaysWithCurrRoster(prevRosterInSubRoster, currRosterInSubRoster, ruleParam);
			if (consecutiveTimesOrDays >= 0) {
				subRosters.emplace_back(currRosterInSubRoster);
				totalConsecutiveTimesOrDays += consecutiveTimesOrDays;
			}
			//每次累计后都检查。若违规，则重置totalConsecutiveTimesOrDays为0
			if (ruleParam.MatchConsecutiveTimesOrDays(consecutiveTimesOrDays, totalConsecutiveTimesOrDays)) {
				//检查是否满足Roster之间休息间隔时长要求
				int workRosterIndex = GetNextWorkRosterIndex(prevRosterInSubRoster, rosters, (consecutiveTimesOrDays < 0) ? j : j+1 , ruleParam);
				auto nextWorkRoster = workRosterIndex < 0 ? nullptr : rosters[workRosterIndex]; //组成连续Roster列表 后一个Roster
				auto actRestTimes = GetRestBetweenRosters(prevWorkRoster, nextWorkRoster, subRosters, offsetTZMinutes, ruleParam);
				for (auto& [restStartTimeUtc, restEndTimeUtc] : actRestTimes) {
					if (!CheckRule(restStartTimeUtc, restEndTimeUtc, offsetTZMinutes, ruleParam)) {
						totalConsecutiveTimesOrDays = 0;
						subRosters.clear();
						prevWorkRoster = currRosterInSubRoster;

						passAllRule = false;
						ThrowRuleViolation(currRosterInSubRoster, restStartTimeUtc, restEndTimeUtc, ruleParam);
						if (!this->IsCheckAllRule()) {
							return passAllRule;
						}
					}
				}

				if (ruleParam._maxRosterConsecutiveTimesOrDays > 0 && totalConsecutiveTimesOrDays >= ruleParam._maxRosterConsecutiveTimesOrDays) {
					totalConsecutiveTimesOrDays = 0;
					subRosters.clear();
				}
			}

			if (consecutiveTimesOrDays < 0) {
				i = j;
				break;
			}

			prevRosterInSubRoster = const_cast<ROSTER*>(rosters[j]);
		}

		//最后一个进行检查
		if (ruleParam.MatchConsecutiveTimesOrDays(-1, totalConsecutiveTimesOrDays) && !subRosters.empty()) {
			//检查是否满足Roster之间休息间隔时长要求
			auto nextWorkRoster = nullptr; //组成连续Roster列表 后一个Roster
			auto actRestTimes = GetRestBetweenRosters(prevWorkRoster, nextWorkRoster, subRosters, offsetTZMinutes, ruleParam);
			for (auto& [restStartTimeUtc, restEndTimeUtc] : actRestTimes) {
				if (!CheckRule(restStartTimeUtc, restEndTimeUtc, offsetTZMinutes, ruleParam)) {
					passAllRule = false;
					ThrowRuleViolation(subRosters[subRosters.size() - 1], restStartTimeUtc, restEndTimeUtc, ruleParam);
					if (!this->IsCheckAllRule()) {
						return passAllRule;
					}
				}
			}
		}
		
		if (j >= rosters.size()) break;

		ROSTER* tmpNextRoster = ((i + 1) == rosters.size()) ? nullptr : const_cast<ROSTER*>(rosters[i + 1]);
		if (!IsRestAssignment(rosters[i], ruleParam) && !IsSBYAndCallout(rosters[i], tmpNextRoster)) {
			prevWorkRoster = const_cast<ROSTER*>(rosters[i]);
		}
	}
	return passAllRule;
}

bool LimitMinRestBetweenRostersForPRRule::CheckRule(const time_t restStartTimeUtc, const time_t restEndTimeUtc, const int offsetTZMinutes, const LimitMinRestBetweenRostersForPRRuleParam& ruleParam) const {
	if (restStartTimeUtc <= 0 || restEndTimeUtc <= 0) {
		return true;
	}
	int actualRest = (int)(restEndTimeUtc - restStartTimeUtc) / 60; //分钟数
	int minRest = 0;
	if (ruleParam._restType == "D") {
		minRest = (int)(ruleParam._minDayOffDays * 24 * 60);
	}
	else {
		minRest = ruleParam._minRestMinutes;
	}
	return actualRest >= minRest;
}

inline static time_t GetRestStartTimeUtc(const ROSTER* roster, const bool isIncludePairingRest, const bool isCountingRestFromPairingEndDay, const string& restType, const int offsetTZMinutes) {
	if (roster == nullptr) {
		return -1;
	}
	time_t restStartTimeUtc = 0;

	if (isIncludePairingRest && isCountingRestFromPairingEndDay) {
		//从Pairing/Roster休息开始时间开始，检查REST需求
		restStartTimeUtc = roster->getRestStartUtcAct();
		if (restType == "D") {
			time_t startLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(restStartTimeUtc, offsetTZMinutes);
			restStartTimeUtc = startLocalDay + (restStartTimeUtc == startLocalDay ? 0 : (time_t)(24 * 60 * 60));
		}
	}
	else if (isIncludePairingRest && !isCountingRestFromPairingEndDay) {
		//从Pairing/Roster休息开始时间的第二天00:00开始，检查REST需求
		time_t startLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(roster->getRestStartUtcAct(), offsetTZMinutes);
		restStartTimeUtc = startLocalDay + (startLocalDay == roster->getRestStartUtcAct() ? 0 : (time_t)(24 * 60 * 60));
	}
	else if (!isIncludePairingRest && isCountingRestFromPairingEndDay) {
		//从Pairing/Roster休息结束时间开始，检查REST需求
		restStartTimeUtc = roster->getEndTimeUtcAct();
		if (restType == "D") {
			time_t startLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(restStartTimeUtc, offsetTZMinutes);
			restStartTimeUtc = startLocalDay + (restStartTimeUtc == startLocalDay ? 0 : (time_t)(24 * 60 * 60));
		}
	}
	else {
		//从Pairing/Roster休息结束时间的第二天00:00开始，检查REST需求
		time_t endLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(roster->getEndTimeUtcAct(), offsetTZMinutes);
		restStartTimeUtc = endLocalDay + (endLocalDay == roster->getEndTimeUtcAct() ? 0 : (time_t)(24 * 60 * 60));
	}

	return restStartTimeUtc;
}

vector<std::tuple<time_t, time_t>> LimitMinRestBetweenRostersForPRRule::GetRestBetweenRosters(const ROSTER* prevRoster, const ROSTER* nextRoster, const std::vector<const ROSTER*>& subRosters, const int offsetTZMinutes, const LimitMinRestBetweenRostersForPRRuleParam& ruleParam) const {
	vector<std::tuple<time_t, time_t>> actRestTimes;
    if (subRosters.empty())	{
		return actRestTimes;
	}
	if (ruleParam._restDirection == "BEFORE" || ruleParam._restDirection == RuleParamConstant::ALL || ruleParam._restDirection == "BOTH") {
		time_t restStartTimeUtc = GetRestStartTimeUtc(prevRoster, ruleParam._isIncludePairingRest, ruleParam._isCountingRestFromPairingEndDay, ruleParam._restType, offsetTZMinutes);

		auto& firstRoster = subRosters.front();
		time_t restEndTimeUtc = firstRoster->getStartTimeUtcAct() - (firstRoster->callinSBY_FDPMins < 0 ?  0 : firstRoster->callinSBY_FDPMins * 60);
		if (restEndTimeUtc <= restStartTimeUtc) {
			//当isCountingRestFromPairingEndDay=false时,由于从Pairing/Roster休息开始时间的第二天00:00开始，因此可能出现 开始时间 晚于 结束时间（下一个Roster的开始时间)
			restEndTimeUtc = restStartTimeUtc;
		}
		actRestTimes.emplace_back(std::make_tuple(restStartTimeUtc, restEndTimeUtc));
	}

	if (ruleParam._restDirection == "AFTER" || ruleParam._restDirection == RuleParamConstant::ALL || ruleParam._restDirection == "BOTH") {
		auto& lastRoster = subRosters.back();
		time_t restStartTimeUtc = GetRestStartTimeUtc(lastRoster, ruleParam._isIncludePairingRest, ruleParam._isCountingRestFromPairingEndDay, ruleParam._restType, offsetTZMinutes);

		time_t restEndTimeUtc = nextRoster == nullptr ? INT_MAX : nextRoster->getStartTimeUtcAct();
		if (restEndTimeUtc <= restStartTimeUtc) {
			//当isCountingRestFromPairingEndDay=false时,由于从Pairing/Roster休息开始时间的第二天00:00开始，因此可能出现 开始时间 晚于 结束时间（下一个Roster的开始时间)
			restEndTimeUtc = restStartTimeUtc;
		}
		actRestTimes.emplace_back(std::make_tuple(restStartTimeUtc, restEndTimeUtc));
	}
	return actRestTimes;
}

int LimitMinRestBetweenRostersForPRRule::GetNextWorkRosterIndex(const ROSTER* prevRoster, const std::vector<const ROSTER*>& rosters, const size_t currIndex, const LimitMinRestBetweenRostersForPRRuleParam& ruleParam) const {
	for (size_t i = currIndex; i < rosters.size(); i++) {
		auto& roster = rosters[i];
		if (!IsRestAssignment(roster, ruleParam)) {
			if (prevRoster == nullptr || prevRoster->actRestStrUtc <= roster->actStrUtc || (i + 1) == rosters.size())
				return (int)i;
		}
	}
	return -1;
}

int LimitMinRestBetweenRostersForPRRule::GetConsecutiveTimesOrDaysWithCurrRoster(const ROSTER* prevRoster, const ROSTER* currRoster, const LimitMinRestBetweenRostersForPRRuleParam& ruleParam) const {
	int consecutiveTimes = -1;
	if (ruleParam._rosterConsecutiveType == "D") {
		//consecutiveTimes = RosterUtils::GetConsecutiveDaysWithCurrRoster(prevRoster, currRoster);
		consecutiveTimes = RosterUtils::GetConsecutiveDaysWithCurrRosterByStartTime(prevRoster, currRoster);
	}
	else {
		consecutiveTimes = RosterUtils::GetConsecutiveTimesWithCurrRoster(prevRoster, currRoster);
	}
	return consecutiveTimes;
}

bool LimitMinRestBetweenRostersForPRRule::IsRestAssignment(const ROSTER* roster, const LimitMinRestBetweenRostersForPRRuleParam& ruleParam) const {
	return RuleParams::GetInstancePtr()->isRestAssignment(roster->qualifier, roster->duty) 
		|| ruleParam.IsRestAssignment(roster);
}

void LimitMinRestBetweenRostersForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitMinRestBetweenRostersForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitMinRestBetweenRostersForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitMinRestBetweenRostersForPRRule::ThrowRuleViolation(const ROSTER* roster, const time_t restStartTimeUtc, const time_t restEndTimeUtc, const LimitMinRestBetweenRostersForPRRuleParam& ruleParam) const {
	string actualRestHHmm = TimeUtils::MinutesTohhmm((int)(restEndTimeUtc - restStartTimeUtc) / 60);
	//在执行连续任务时，实际休息时长小于最小休息时长。
	//string msg = "The actual rest period ({0:actualRestHHmm}) is less than the minimum rest ({1:minRestHHmm}).";
	//msg = StringUtils::Format(msg, actualRestHHmm, ruleParam._restType == "D" ? (ruleParam._minRest + " days") : ruleParam._minRest);
	string msg = "The actual rest period ({0:actualRestHHmm}) ({1:direction}) ({2:consecutive}{3:consecutiveType}) consecutive duties with attribute ({4:attribute}) is less than the minimum rest ({5:minRestHHmm}).";
	msg = StringUtils::Format(msg, actualRestHHmm, strToLower(ruleParam._restDirection), ruleParam._strRosterConsecutiveTimesOrDays, strToLower(ruleParam._rosterConsecutiveType),
		ruleParam._strPairingAttributes, ruleParam._restType == "D" ? (ruleParam._minRest + " days") : ruleParam._minRest);
	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = roster->rosterId;
	rv->pairingId = roster->pairing == nullptr ? -1 : roster->pairId;
	rv->startDTUtc = restStartTimeUtc;
	rv->endDTUtc = restEndTimeUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("actualRest", actualRestHHmm));
	rv->operation_result.insert(pair<string, string>("direction", ruleParam._restDirection));
	rv->operation_result.insert(pair<string, string>("consecutive", ruleParam._strRosterConsecutiveTimesOrDays));
	rv->operation_result.insert(pair<string, string>("consecutiveType", ruleParam._rosterConsecutiveType));
	rv->operation_result.insert(pair<string, string>("attribute", ruleParam._strPairingAttributes));
	rv->operation_result.insert(pair<string, string>("minRest", ruleParam._minRest));
	rv->operation_result.insert(pair<string, string>("restType", ruleParam._restType));
	_ruleViolation.AddRuleViolations(rv);
}