/**
 * @file CheckBirthdayDaysOffForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-11-03
**/

#include "../RuleSytem.h"
#include "CheckBirthdayDaysOffForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "index/CrewRpRecencyIndex.h"


bool CheckBirthdayDaysOffForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
	if (rosters.empty()) {
		return true;
	}
	time_t checkedStartTime = this->_dbData->scenario.startDtUTC;
	time_t checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;

	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string crewBase = crew->getPrimeBase();
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeLocSch(), crewBase, this->GetDataContext());

	time_t birthdayUtc = GetBirthdayUtcInScenario(crew, offsetTZMinutes, this->_dbData->scenario.startDtUTC, this->_dbData->scenario.endDtUTC);
	if (birthdayUtc < 0) {
		//生日不在场景范围内
		return true;
	}

	for (const auto& ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		_ruleViolation.SetRuleParam(ruleParam);

		bool valid = CheckRule(rosters, crew, birthdayUtc, offsetTZMinutes, ruleParam);
		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}


bool CheckBirthdayDaysOffForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew, const time_t birthdayUtc, const int offsetTZMinutes, const CheckBirthdayDaysOffForPRRuleParam& ruleParam) const {
	bool passAllRule = true;
	
	//机组人员生日安排DO日期范围[startTimeLowerUtc,endTimeUpperUtc]
	time_t startDayUtcLower = birthdayUtc - (time_t)ruleParam._daysOffBeforeBirthday * 24 * 60 * 60;
	time_t endDayUtcUpper = birthdayUtc + (time_t)ruleParam._daysOffAfterBirthday * 24 * 60 * 60;
	map<time_t, std::tuple<std::shared_ptr<bool>, ROSTER*>> birthdayRangesMap;//map<生日需要安排DO的天(UTC), <是否安排DO(默认null未知), 安排Roster(可能为nullptr)>>
	for (int i = 0; i <=(ruleParam._daysOffBeforeBirthday + ruleParam._daysOffAfterBirthday); i++) {
		birthdayRangesMap.insert(std::make_pair(startDayUtcLower + (time_t)i * 24 * 60 * 60, std::make_tuple(nullptr, nullptr)));
	}

	//机组人员生日前后最迟签出时间和最早签到时间点
	time_t latestCheckoutTimeUtc = startDayUtcLower - (time_t) 24 * 60 * 60 + (time_t)ruleParam._latestEndTimeHHmmMinutes * 60;
	time_t earliestCheckInTimeUtc = endDayUtcUpper + (time_t)24 * 60 * 60 + (time_t)ruleParam._earliestStartTimeHHmmMinutes * 60;

	for (size_t i = 0; i < rosters.size(); i++) {
		const ROSTER* currRoster = rosters[i];
		const ROSTER* nextRoster = (i + 1) == rosters.size() ? nullptr : rosters[i+1];

		//场景1：检查生日前后[daysOffBeforeBirthday,daysOffAfterBirthday]必须安排DO任务,且仅能安排DO任务
		CheckRuleForDOAssignment(birthdayRangesMap, currRoster, birthdayUtc, offsetTZMinutes, ruleParam);

		//场景2：检查生日前后签出和签到时间是否满足
		bool next = true;
		if (!CheckRuleForLatestEndAndEarliestStart(next, currRoster, nextRoster, startDayUtcLower, endDayUtcUpper, latestCheckoutTimeUtc, earliestCheckInTimeUtc, crew, offsetTZMinutes, ruleParam)) {
			passAllRule = false;
		}

		if (!next || currRoster->actStrUtc > earliestCheckInTimeUtc) {
			break;
		}
	}

	//场景1：告警输出，生日当天及前后未安排任务不告警，仅安排不符合要求的任务才告警
	for (auto& pair : birthdayRangesMap) {
		if (std::get<0>(pair.second) != nullptr && !(*std::get<0>(pair.second).get())) {
			ThrowRuleViolationForNotAssignDO(birthdayUtc, startDayUtcLower, (endDayUtcUpper + 24 * 3600 - 60), pair.first, std::get<1>(pair.second), ruleParam);
			passAllRule = false;
		}
	}
	return passAllRule;
}

bool CheckBirthdayDaysOffForPRRule::CheckRuleForDOAssignment(map<time_t, std::tuple<std::shared_ptr<bool>, ROSTER*>>& birthdayRangesMap, const ROSTER* roster, const time_t birthdayUtc, const int offsetTZMinutes, const CheckBirthdayDaysOffForPRRuleParam& ruleParam) const {
	time_t rosterStartDayUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(roster->actStrUtc, offsetTZMinutes);//Roster工作开始时间
	time_t rosterRestStartDayUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(roster->actRestStrUtc, offsetTZMinutes);//Roster工作结束时间

	bool isBirthdayAssignment = (birthdayUtc == rosterStartDayUtc) ? ruleParam.MatchBirthdayAssignment(roster) : ruleParam.MatchBeforeAndAfterBirthdayAssignment(roster);
	auto iterStartDay = birthdayRangesMap.find(rosterStartDayUtc);
	if (iterStartDay != birthdayRangesMap.end()) {
		//生日当日状态未知或已安排DO任务(true)时，需要重新设置状态（即生日当日安排其他任务此时为false，不能在转换成true）
		if (std::get<0>(iterStartDay->second) == nullptr || *std::get<0>(iterStartDay->second).get()) {
			std::get<0>(iterStartDay->second) = std::make_shared<bool>(isBirthdayAssignment);
			std::get<1>(iterStartDay->second) = const_cast<ROSTER*>(roster);
		}
	}

	if (rosterRestStartDayUtc != rosterStartDayUtc) {
		auto iterStartRestDay = birthdayRangesMap.find(rosterRestStartDayUtc);
		if (iterStartRestDay != birthdayRangesMap.end()) {
			//生日当日状态未知或已安排DO任务(true)时，需要重新设置状态（即生日当日安排其他任务此时为false，不能在转换成true）
			if (std::get<0>(iterStartRestDay->second) == nullptr || *std::get<0>(iterStartRestDay->second).get()) {
				std::get<0>(iterStartRestDay->second) = std::make_shared<bool>(isBirthdayAssignment);
				std::get<1>(iterStartRestDay->second) = const_cast<ROSTER*>(roster);
			}
		}
	}
	return true;
}

bool CheckBirthdayDaysOffForPRRule::CheckRuleForLatestEndAndEarliestStart(bool& next, const ROSTER* currRoster, const ROSTER* nextRoster, const time_t startDayUtcLower, const time_t endDayUtcUpper, const time_t latestCheckoutTimeUtc, const time_t earliestCheckInTimeUtc, const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const CheckBirthdayDaysOffForPRRuleParam& ruleParam) const {
	if (RuleParams::GetInstancePtr()->isRestAssignment(currRoster->qualifier, currRoster->duty)
		|| ruleParam.MatchBirthdayAssignment(currRoster) || ruleParam.MatchBeforeAndAfterBirthdayAssignment(currRoster)) {
		//若是休息则直接返回true
		return true;
	}

	//场景1：检查最迟签出时间。获得生日前最后一个Roster，判断签出时间是否满足
	if ((currRoster->actRestStrUtc <= startDayUtcLower && currRoster->actRestStrUtc > latestCheckoutTimeUtc) 
		&& (nextRoster == nullptr || nextRoster->actStrUtc >= startDayUtcLower)) {
		ThrowRuleViolationForLatestEnd(currRoster, ruleParam);
		return false;
	}

	//场景2：检查最早签入时间。获得生日后第一个Roster，判断签入时间是否满足
	if (currRoster->actStrUtc >= (endDayUtcUpper + (time_t)24 * 60 * 60) && currRoster->actStrUtc < earliestCheckInTimeUtc) {
		ThrowRuleViolationForEarliestStart(currRoster, ruleParam);
		next = false;//已经告警不在继续检查，避免重复告警
		return false;
	}

	return true;
}


void CheckBirthdayDaysOffForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckBirthdayDaysOffForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckBirthdayDaysOffForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

time_t CheckBirthdayDaysOffForPRRule::GetBirthdayUtcInScenario(const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const time_t checkedStartTime, const time_t checkedEndTime) const {
	tm birthday = crew->birthdayTm;//本地时间
	time_t birthdayUtcBasedStart = Utility::GetInstancePtr()->getBirthdayInAYear(checkedStartTime + (time_t)offsetTZMinutes * 60, birthday) - (time_t)offsetTZMinutes * 60;
	time_t birthdayUtcBasedEnd = Utility::GetInstancePtr()->getBirthdayInAYear(checkedEndTime + (time_t)offsetTZMinutes * 60, birthday) - (time_t)offsetTZMinutes * 60;

	//前提：场景加载数据不会大于1年
	time_t birthdayUtc = -1;
	if (birthdayUtcBasedStart >= checkedStartTime && birthdayUtcBasedStart <= checkedEndTime) {
		birthdayUtc = birthdayUtcBasedStart;
	}
	else if (birthdayUtcBasedEnd >= checkedStartTime && birthdayUtcBasedEnd <= checkedEndTime) {
		birthdayUtc = birthdayUtcBasedEnd;
	}
	return birthdayUtc;
}

void CheckBirthdayDaysOffForPRRule::ThrowRuleViolationForNotAssignDO(const time_t birthdayUtc, const time_t checkedStartUtc, const time_t checkedEndUtc, const time_t checkBirthdayUtc, const ROSTER* roster, const CheckBirthdayDaysOffForPRRuleParam& ruleParam) const {
	string strBirthdayAssignments = StringUtils::Join(ruleParam._birthdayAssignments, "|");
	string strBeforeAndAfterBirthdayAssignments = StringUtils::Join(ruleParam._beforeAndAfterBirthdayAssignments, "|");
	string msg;
	if (birthdayUtc == checkBirthdayUtc) {
		//在机组人员生日当天必须且仅能分配({0:birthdayAssignments})任务。
		msg = "Assignment ({0:birthdayAssignments}) must and can only be assigned on the crew's birthday.";
		msg = StringUtils::Format(msg, strBirthdayAssignments);
	}
	else {
		//在机组人员生日前后必须分配({0:beforeAndAfterBirthdayAssignments})任务。
		msg = "Assignment ({0:beforeAndAfterBirthdayAssignments}) must be assigned before and after the crew's birthday.";
        msg = StringUtils::Format(msg, strBeforeAndAfterBirthdayAssignments);
	}
	
	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->startDTUtc = checkedStartUtc;
	rv->endDTUtc = checkedEndUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	if (birthdayUtc == checkedStartUtc) {
		rv->operation_result.insert(pair<string, string>("birthdayAssignments", strBirthdayAssignments));
	}
	else {
		rv->operation_result.insert(pair<string, string>("beforeAndAfterBirthdayAssignments", strBeforeAndAfterBirthdayAssignments));
	}
	_ruleViolation.AddRuleViolations(rv);
}

void CheckBirthdayDaysOffForPRRule::ThrowRuleViolationForLatestEnd(const ROSTER* roster, const CheckBirthdayDaysOffForPRRuleParam& ruleParam) const {
	//Crew签出时间不能必须晚于{0:hhmm}
	string msg = "The crew's check-out time cannot be later than {0:latestEndTimeHHmm}.";
	msg = StringUtils::Format(msg, ruleParam._latestEndTimeHHmm);

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
	rv->operation_result.insert(pair<string, string>("latestEndTimeHHmm", ruleParam._latestEndTimeHHmm));

	_ruleViolation.AddRuleViolations(rv);
}

void CheckBirthdayDaysOffForPRRule::ThrowRuleViolationForEarliestStart(const ROSTER* roster, const CheckBirthdayDaysOffForPRRuleParam& ruleParam) const {
	//Crew签到时间不能早于{0:hhmm}
	string msg = "The crew's check-in time cannot be earlier than {0:earliestStartTimeHHmm}.";
	msg = StringUtils::Format(msg, ruleParam._earliestStartTimeHHmm);

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
	rv->operation_result.insert(pair<string, string>("earliestStartTimeHHmm", ruleParam._earliestStartTimeHHmm));

	_ruleViolation.AddRuleViolations(rv);
}