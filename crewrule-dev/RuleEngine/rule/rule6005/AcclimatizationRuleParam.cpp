/**
 * @file AcclimatizationRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "AcclimatizationRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "TimezoneUtils.h"
#include "../constant/Constants.h"

using namespace std;

void AcclimatizationRuleParam::ParseParam(const std::string &paramString) {
	assert(false);
}

void AcclimatizationRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	if (dbRule.tableNum == 1) {
		_acclimatizationStateParam->ParseParam(dbRule);
	}
	else {
		_adaptionPeriodParams.emplace_back(AdaptionPeriodParam(this->GetRule()));
		auto& newParam = _adaptionPeriodParams.back();
		newParam.ParseParam(dbRule);
	}
}

bool AcclimatizationRuleParam::MatchTimeZoneDiff(const Duty& duty, const Duty& lastAcclimatisedDuty
	, const SharedPtr<CrewDataContext>& dbData) const {
	//当前执勤期Duty起飞和落地地点的时差
	int dutyTimeZoneDiff = DutyUtils::GetTimeZoneDiff(lastAcclimatisedDuty, duty, dbData);
	int absDutyTimeZoneDiff = TimezoneUtils::abs(dutyTimeZoneDiff);
	if (absDutyTimeZoneDiff >= _acclimatizationStateParam->_timezoneDiffMinutesLower
			&& absDutyTimeZoneDiff < _acclimatizationStateParam->_timezoneDiffMinutesUpper) {
		return true;
	}
	return false;
}

bool AcclimatizationRuleParam::MatchTimeZoneDiffForRestStart(const Duty& duty, const Duty& lastAcclimatisedDuty
	, const SharedPtr<CrewDataContext>& dbData) const {
	//当前执勤期Duty落地机场和最后适应地（Duty起飞机场）的时差
	string lastAcclimatisedDutyDepZoneId = dbData->getAirportZoneId(lastAcclimatisedDuty.getDepartureStation());
	string dutyArrZoneId = dbData->getAirportZoneId(duty.getArrivalStation());
	int dutyTimeZoneDiff = TimezoneUtils::GetTimezoneOffsetByStart(lastAcclimatisedDuty.getStartTimeUtcAct(), lastAcclimatisedDutyDepZoneId, dutyArrZoneId);

	int absDutyTimeZoneDiff = TimezoneUtils::abs(dutyTimeZoneDiff);
	if (absDutyTimeZoneDiff >= _acclimatizationStateParam->_timezoneDiffMinutesLower
		&& absDutyTimeZoneDiff < _acclimatizationStateParam->_timezoneDiffMinutesUpper) {
		return true;
	}
	return false;
}

bool AcclimatizationRuleParam::MatchAcclimatizationState(const Duty& duty, const Duty& lastAcclimatisedDuty
	, const SharedPtr<CrewDataContext>& dbData) const {
	//当前执勤期Duty起飞和落地地点的时差
	int dutyTimeZoneDiff = DutyUtils::GetTimeZoneDiff(lastAcclimatisedDuty, duty, dbData);
	int absDutyTimeZoneDiff = TimezoneUtils::abs(dutyTimeZoneDiff);
	if (absDutyTimeZoneDiff >= _acclimatizationStateParam->_timezoneDiffMinutesLower
		&& absDutyTimeZoneDiff < _acclimatizationStateParam->_timezoneDiffMinutesUpper) {

		//"当前执勤期Duty起飞地点" 与 "处于最近适应状态Duty起飞地点"的时差
		int timeSinceLastAccMinutes = DutyUtils::GetIntervalFromSS(lastAcclimatisedDuty, duty) / 60;
		if (timeSinceLastAccMinutes >= _acclimatizationStateParam->_timeSinceLastAccMinutesLower
			&& timeSinceLastAccMinutes < _acclimatizationStateParam->_timeSinceLastAccMinutesUpper) {
			return true;
		}
	}
	return false;
}

bool AcclimatizationRuleParam::MatchAcclimatizationStateForRestStart(const Duty& currDuty, const Duty& lastAcclimatisedDuty
	, const SharedPtr<CrewDataContext>& dbData) const {
	//当前执勤期Duty落地机场和最后适应地（Duty起飞机场）的时差
	string lastAcclimatisedDutyDepZoneId = dbData->getAirportZoneId(lastAcclimatisedDuty.getDepartureStation());
	string dutyArrZoneId = dbData->getAirportZoneId(currDuty.getArrivalStation());
	int dutyTimeZoneDiff = TimezoneUtils::GetTimezoneOffsetByStart(lastAcclimatisedDuty.getStartTimeUtcAct(), lastAcclimatisedDutyDepZoneId, dutyArrZoneId);


	int absDutyTimeZoneDiff = TimezoneUtils::abs(dutyTimeZoneDiff);
	if (absDutyTimeZoneDiff >= _acclimatizationStateParam->_timezoneDiffMinutesLower
		&& absDutyTimeZoneDiff < _acclimatizationStateParam->_timezoneDiffMinutesUpper) {

		//"当前执勤期Duty起飞地点" 与 "处于最近适应状态Duty起飞地点"的时差
		time_t actRestStartTimeUtc = const_cast<Duty&>(currDuty).getEndTimeUtcAct();
		Duty* nextDuty = nullptr;
		DutyUtils::GetActualRestMinutes(actRestStartTimeUtc, &currDuty, nextDuty, dbData);
		int inteval = static_cast<int>(actRestStartTimeUtc - const_cast<Duty&>(lastAcclimatisedDuty).getStartTimeUtcAct());
		int timeSinceLastAccMinutes = inteval / 60;
		if (timeSinceLastAccMinutes >= _acclimatizationStateParam->_timeSinceLastAccMinutesLower
			&& timeSinceLastAccMinutes < _acclimatizationStateParam->_timeSinceLastAccMinutesUpper) {
			return true;
		}
	}
	return false;
}

int AcclimatizationRuleParam::GetAdaptionPeriod(const Duty& lastAcclimatisedDuty,
	const Duty& maxTimeZoneDiffDuty, const unsigned int maxTimeZoneDiff, const SharedPtr<CrewDataContext>& dbData) const {
	for (auto& adaptionPeriodParam : _adaptionPeriodParams) {
		if ((int)maxTimeZoneDiff >= adaptionPeriodParam._timezoneDiffMinutesLower
			&& (int)maxTimeZoneDiff < adaptionPeriodParam._timezoneDiffMinutesUpper) {
			string displacementDirection = DutyUtils::GetDisplacementDirection(lastAcclimatisedDuty, maxTimeZoneDiffDuty, dbData);
			if (displacementDirection == adaptionPeriodParam._direction) {
				return adaptionPeriodParam._adaptionPeriodMinutes;
			}
		}
	}
	return 0;
}

//bool AcclimatizationRuleParam::MatchParam(const std::string& composition, const long &reportTime, bool isAugment) const {
//
//    // The checking sequence can be reordered to better speed up the process
//    if (isAugment != _isAugment) return false;
//
//    if (_composition.front() != InputRuleParamDefine::WildcardChar && composition != _composition) return false;
//
//    if (reportTime < _reportTimeLower || reportTime > _reportTimeUpper) return false;
//
//    return true;
//}


