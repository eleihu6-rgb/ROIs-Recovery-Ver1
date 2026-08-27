#include "CheckMinRestAfterBaseChangeForPRRule.h"
/**
 * @file CheckMinRestAfterBaseChangeForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-27
**/

#include "../RuleSytem.h"
#include "CheckMinRestAfterBaseChangeForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/DutyUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/CrewRpRecencyIndex.h"


bool CheckMinRestAfterBaseChangeForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
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

		//Base变更后第一个休息的Map
		map<string, std::tuple<std::shared_ptr<ROSTER>, time_t, std::shared_ptr<ROSTER>>> rosterAfterBaseChangeMap = GetRosterAfterBaseChange(crew, checkedStartTime, checkedEndTime, ruleParam);

		bool valid = CheckRule(rosterAfterBaseChangeMap, ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}


bool CheckMinRestAfterBaseChangeForPRRule::CheckRule(const map<string, std::tuple<std::shared_ptr<ROSTER>, time_t, std::shared_ptr<ROSTER>>>& rosterAfterBaseChangeMap, const CheckMinRestAfterBaseChangeForPRRuleParam& ruleParam) const {
	bool passAllRule = true;
	
	for (auto& pair : rosterAfterBaseChangeMap) {
		auto& newBase = pair.first;
        //auto& beforeRoster = std::get<0>(pair.second); //原基地最后一个排班，可能不存在
        auto changeBaseUtc = std::get<1>(pair.second); //基地变更的时间点
        auto& afterRoster = std::get<2>(pair.second); //基地变更后第一个排班

		//基于新基地时区计算休息时间
		int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(changeBaseUtc, newBase, this->GetDataContext());

		if (ruleParam._restType == "RH") {
			int actRestMinutes = static_cast<int>((afterRoster->actStrUtc - changeBaseUtc) / 60);
			if (actRestMinutes < ruleParam._minRest * 60) {
				ThrowRuleViolationForMinRest(changeBaseUtc, afterRoster.get(), ruleParam);
				passAllRule = false;
				continue;
			}

		}
		else if (ruleParam._restType == "CD") {
            //计算实际休息日历日数
			int restCalendarDays = TimeUtils::CalculateFullDaysBetweenTimes(changeBaseUtc + offsetTZMinutes * 60, afterRoster->actStrUtc + offsetTZMinutes * 60);
			if (restCalendarDays < ruleParam._minRest) {
				ThrowRuleViolationForMinRest(changeBaseUtc, afterRoster.get(), ruleParam);
				passAllRule = false;
				continue;
			}
		}

		//检查本地夜间休息
		if (ruleParam._strIncludingLocalNights != "*") {
			int localNightNum = DutyUtils::GetLocalNightNums(changeBaseUtc, afterRoster->actStrUtc, offsetTZMinutes);
			if (localNightNum < ruleParam._includingLocalNightsNum) {
				ThrowRuleViolationForLocalNight(changeBaseUtc, afterRoster.get(), ruleParam);
				passAllRule = false;
				continue;
            }
		}
	}

	return passAllRule;
}

void CheckMinRestAfterBaseChangeForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckMinRestAfterBaseChangeForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckMinRestAfterBaseChangeForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}
map<string, std::tuple<std::shared_ptr<ROSTER>, time_t, std::shared_ptr<ROSTER>>> CheckMinRestAfterBaseChangeForPRRule::GetRosterAfterBaseChange(const std::shared_ptr<CREW>& crew, const time_t checkedStartTime, const time_t checkedEndTime, const CheckMinRestAfterBaseChangeForPRRuleParam& ruleParam) const
{
	map<string, std::tuple<std::shared_ptr<ROSTER>, time_t, std::shared_ptr<ROSTER>>> results;

	if (!crew || crew->rosterList.empty() || crew->baseList.empty()) {
		return results;
	}

	// 遍历基地列表，查找基地变更
	for (size_t i = 1; i < crew->baseList.size(); i++) {
		const auto& prevBase = crew->baseList[i - 1];
		const auto& currBase = crew->baseList[i];

		// 检查基地变更是否在检查时间范围内
		if (currBase->effUtc < checkedStartTime || currBase->effUtc > checkedEndTime) {
			continue;
		}

		// 跳过相同基地的变更
		if (prevBase->base == currBase->base) {
			continue;
		}

		shared_ptr<ROSTER> lastRosterInOldBase = nullptr;  // 原基地最后一个排班
		shared_ptr<ROSTER> firstRosterInNewBase = nullptr;  // 新基地第一个排班
        time_t changeBaseUtc = currBase->effUtc; // 基地变更的时间点

		for (const auto& roster : crew->rosterList) {
			if (!ruleParam.MatchWorkingAssignmentGroup(roster.get())) {
				continue;
			}

			//查找原基地最后一个排班（在基地变更前）, 实际结束时间在基地变更前，且在检查时间范围内
			if (roster->actEndUtc < currBase->effUtc && roster->actEndUtc >= checkedStartTime) {
				if (!lastRosterInOldBase || roster->actEndUtc > lastRosterInOldBase->actEndUtc) {
					lastRosterInOldBase = roster;
				}
			}

			//查找新基地第一个排班（在基地变更后）, 实际开始时间在基地变更后，且在检查时间范围内
			if (roster->actStrUtc > currBase->effUtc && roster->actStrUtc <= checkedEndTime) {
				if (!firstRosterInNewBase || roster->actStrUtc < firstRosterInNewBase->actStrUtc) {
					firstRosterInNewBase = roster;
				}
			}
		}

		// 如果找到有效的排班对，添加到结果中
		if (firstRosterInNewBase) {
			results[currBase->base] = make_tuple(lastRosterInOldBase, changeBaseUtc, firstRosterInNewBase);
		}
	}

	return results;
}

void CheckMinRestAfterBaseChangeForPRRule::ThrowRuleViolationForMinRest(time_t changeBaseUtc, const ROSTER* afterRoster, const CheckMinRestAfterBaseChangeForPRRuleParam& ruleParam) const {
	string actRestMinutesHHmm = TimeUtils::MinutesTohhmm(static_cast<int>((afterRoster->actStrUtc - changeBaseUtc)/60));
	string msg = "The actual rest ({0:actRestMinutesHHmm}) following a base change is less than the minimum rest ({1:minRest}{2:restType}).";
	msg = StringUtils::Format(msg, actRestMinutesHHmm, ruleParam._minRest, ruleParam._restType);

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = afterRoster->rosterId;
	rv->pairingId = afterRoster->pairing == nullptr ? -1 : afterRoster->pairId;
	rv->startDTUtc = changeBaseUtc;
	rv->endDTUtc = afterRoster->actStrUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("actRestMinutesHHmm", actRestMinutesHHmm));
	rv->operation_result.insert(pair<string, string>("minRest", std::to_string(ruleParam._minRest)));
	rv->operation_result.insert(pair<string, string>("restType", ruleParam._restType));

	_ruleViolation.AddRuleViolations(rv);
}

void CheckMinRestAfterBaseChangeForPRRule::ThrowRuleViolationForLocalNight(const time_t changeBaseUtc, const ROSTER* afterRoster, const CheckMinRestAfterBaseChangeForPRRuleParam& ruleParam) const {
	string actRestMinutesHHmm = TimeUtils::MinutesTohhmm(static_cast<int>((afterRoster->actStrUtc - changeBaseUtc) / 60));

	//string msg = "The actual rest ({0:actRestMinutesHHmm}) following a base change is less than the minimum rest ({1:minRest}{2:restType}) or the required number of local nights ({3:includingLocalNights}).";
	//msg = StringUtils::Format(msg, actRestMinutesHHmm, ruleParam._minRest, ruleParam._restType, ruleParam._strIncludingLocalNights);
	string msg = "The actual rest ({0:actRestMinutesHHmm}) following a base change is less than the required number of local nights ({1:includingLocalNights}).";
	msg = StringUtils::Format(msg, actRestMinutesHHmm, ruleParam._strIncludingLocalNights);

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->rosterId = afterRoster->rosterId;
	rv->pairingId = afterRoster->pairing == nullptr ? -1 : afterRoster->pairId;
	rv->startDTUtc = changeBaseUtc;
	rv->endDTUtc = afterRoster->actStrUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("actRestMinutesHHmm", actRestMinutesHHmm));
	rv->operation_result.insert(pair<string, string>("includingLocalNights", ruleParam._strIncludingLocalNights));

	_ruleViolation.AddRuleViolations(rv);
}