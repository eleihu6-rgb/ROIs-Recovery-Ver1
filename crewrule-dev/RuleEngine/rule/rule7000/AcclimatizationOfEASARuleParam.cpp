/**
 * @file AcclimatizationOfEASARuleParam.h
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
#include "AcclimatizationOfEASARuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "TimezoneUtils.h"
#include "../constant/Constants.h"

using namespace std;

void AcclimatizationOfEASARuleParam::ParseParam(const std::string& paramString) {
	std::stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		std::string substr;
		std::getline(ss, substr, delimInParam);
		if (!substr.empty()) {
			switch (i) {
			case enum_to_underlying(ParamLocation::REF_TZ_START): {
				_refTZStart = substr;
				_refTZStartMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::REF_TZ_END): {
				_refTZEnd = substr;
				_refTZEndMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::ETRTZ_START):
				_ETRTZStart = substr;
				_etrtzStartMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::ETRTZ_END):
				_ETRTZEnd = substr;
				_etrtzEndMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::ACC_STATE):
				_acclimatizationState = substr;
				break;
			case enum_to_underlying(ParamLocation::SEVERITY):
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			}
		}
	}
}

void AcclimatizationOfEASARuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "REF TZ START") {
			_refTZStart = headeValue;
			_refTZStartMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "REF TZ END") {
			_refTZEnd = headeValue;
			_refTZEndMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "ETRTZ START") {
			_ETRTZStart = headeValue;
			_etrtzStartMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "ETRTZ END") {
			_ETRTZEnd = headeValue;
			_etrtzEndMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "ACC STATE") {
			_acclimatizationState = headeValue;
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool AcclimatizationOfEASARuleParam::MatchTimeZoneDiffForRestStart(const Duty& duty, const Duty& lastAcclimatisedDuty
	, const SharedPtr<CrewDataContext>& dbData) const {
	//当前执勤期Duty落地机场和最后适应地（Duty起飞机场）的时差
	string lastAcclimatisedDutyDepZoneId = dbData->getAirportZoneId(lastAcclimatisedDuty.getDepartureStation());
	string dutyArrZoneId = dbData->getAirportZoneId(duty.getArrivalStation());
	int dutyTimeZoneDiff = TimezoneUtils::GetTimezoneOffsetByStart(lastAcclimatisedDuty.getStartTimeUtcAct(), lastAcclimatisedDutyDepZoneId, dutyArrZoneId);

	int absDutyTimeZoneDiff = TimezoneUtils::abs(dutyTimeZoneDiff);
	if (absDutyTimeZoneDiff >= _refTZStartMinutes
		&& absDutyTimeZoneDiff < _refTZEndMinutes) {
		return true;
	}
	return false;
}

bool AcclimatizationOfEASARuleParam::MatchAcclimatizationState(const Duty& duty, const Duty& lastAcclimatisedDuty
	, const SharedPtr<CrewDataContext>& dbData) const {
	//当前执勤期Duty起飞和落地地点的时差
	int dutyTimeZoneDiff = DutyUtils::GetTimeZoneDiff(lastAcclimatisedDuty, duty, dbData);
	int absDutyTimeZoneDiff = TimezoneUtils::abs(dutyTimeZoneDiff);
	if (absDutyTimeZoneDiff >= _refTZStartMinutes
		&& absDutyTimeZoneDiff < _refTZEndMinutes) {

		//"当前执勤期Duty起飞地点" 与 "处于最近适应状态Duty起飞地点"的时差
		int timeSinceLastAccMinutes = DutyUtils::GetIntervalFromSS(lastAcclimatisedDuty, duty) / 60;
		if (timeSinceLastAccMinutes >= _etrtzStartMinutes
			&& timeSinceLastAccMinutes < _etrtzEndMinutes) {
			return true;
		}
	}
	return false;
}

bool AcclimatizationOfEASARuleParam::MatchAcclimatizationStateForRestStart(const Duty& currDuty, const Duty& lastAcclimatisedDuty
	, const SharedPtr<CrewDataContext>& dbData) const {
	//当前执勤期Duty落地机场和最后适应地（Duty起飞机场）的时差
	string lastAcclimatisedDutyDepZoneId = dbData->getAirportZoneId(lastAcclimatisedDuty.getDepartureStation());
	string dutyArrZoneId = dbData->getAirportZoneId(currDuty.getArrivalStation());
	int dutyTimeZoneDiff = TimezoneUtils::GetTimezoneOffsetByStart(lastAcclimatisedDuty.getStartTimeUtcAct(), lastAcclimatisedDutyDepZoneId, dutyArrZoneId);


	int absDutyTimeZoneDiff = TimezoneUtils::abs(dutyTimeZoneDiff);
	if (absDutyTimeZoneDiff >= _refTZStartMinutes
		&& absDutyTimeZoneDiff < _refTZEndMinutes) {

		//"当前执勤期Duty起飞地点" 与 "处于最近适应状态Duty起飞地点"的时差
		time_t actRestStartTimeUtc = const_cast<Duty&>(currDuty).getEndTimeUtcAct();
		Duty* nextDuty = nullptr;
		DutyUtils::GetActualRestMinutes(actRestStartTimeUtc, &currDuty, nextDuty, dbData);
		int inteval = static_cast<int>(actRestStartTimeUtc - const_cast<Duty&>(lastAcclimatisedDuty).getStartTimeUtcAct());
		int timeSinceLastAccMinutes = inteval / 60;
		if (timeSinceLastAccMinutes >= _etrtzStartMinutes
			&& timeSinceLastAccMinutes < _etrtzEndMinutes) {
			return true;
		}
	}
	return false;
}

