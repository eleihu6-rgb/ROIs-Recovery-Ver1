/**
 * @file LayoverRestLimitByTimeZoneForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include <algorithm>

#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "LayoverRestLimitByTimeZoneForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"
#include "TimezoneUtils.h"

using namespace std;

void LayoverRestLimitByTimeZoneForEvaFdRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::BASES): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _bases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::RANKS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _ranks);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLEETS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _fleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::TEAMS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _teams);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::SEGMENT_ASSIGNMENTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _segmentAssignments);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_NUM_OF_PAIRING_DUTY): {
				_strMinNumOfPairingDuty = substr;
				_minNumOfPairingDuty = (substr == RuleParamConstant::ALL) ? -1 : stoi(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_TIME_ZONE_GAP): {
				_minTimeZoneGap = substr;
				_minTimeZoneGapMinutes = (substr == RuleParamConstant::ALL) ? -1 : TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::LAYOVER_MIN_REST): {
				_strLayoverMinRest = substr;
				_layoverMinRestMinutes = (substr == RuleParamConstant::ALL) ? -1 : TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::SLEEP_CYCLE_START): {
				_sleepCycleStart = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::SLEEP_CYCLE_END): {
				_sleepCycleEnd = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_SLEEP_CYCLES): {
				_strMinSleepCycles = substr;
				_minSleepCycles = (substr == RuleParamConstant::ALL) ? -1 : stoi(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::SEVERITY):
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void LayoverRestLimitByTimeZoneForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Segment Assignments,No Of Pairing Sector,Min Time Zone Gap,Layover Min Rest,Min WOCL Number
		if (header == "BASES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _bases);
			}
		}
		else if (header == "RANKS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _ranks);
			}
		}
		else if (header == "FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _fleets);
			}
		}
		else if (header == "TEAMS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _teams);
			}
		}
		else if (header == "SEGMENT ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _segmentAssignments);
			}
		}
		else if (header == "MIN NUM OF PAIRING DUTY" || header == "MIN NUM OF PAIRING SECTOR" || header == "NO OF PAIRING SECTOR") {
			_strMinNumOfPairingDuty = headeValue;
			_minNumOfPairingDuty = (headeValue == RuleParamConstant::ALL) ? -1 : stoi(headeValue);
		}
		else if (header == "MIN TIME ZONE GAP") {
			_minTimeZoneGap = headeValue;
			_minTimeZoneGapMinutes = (headeValue == RuleParamConstant::ALL) ? -1 : TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "LAYOVER MIN REST") {
			_strLayoverMinRest = headeValue;
			_layoverMinRestMinutes = (headeValue == RuleParamConstant::ALL) ? -1 : TimeUtils::hhmmToMinutes(headeValue);

		}
		else if (header == "SLEEP CYCLE START") {
			_sleepCycleStart = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SLEEP CYCLE END") {
			_sleepCycleEnd = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "MIN SLEEP CYCLES") {
			_strMinSleepCycles = headeValue;
			_minSleepCycles = atoi(headeValue.c_str());
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//是否忽略"Layover最小休息时长（分钟数）"参数，返回true-忽略，false-未忽略
bool LayoverRestLimitByTimeZoneForEvaFdRuleParam::ignoreMinRestAtLayover() const {
	return _strLayoverMinRest.empty() || _strLayoverMinRest == RuleParamConstant::ALL;
}

//是否忽略"Layover最小WOCL次数"参数，返回true-忽略，false-未忽略
bool LayoverRestLimitByTimeZoneForEvaFdRuleParam::ignoreMinWOCLAtLayover() const {
	return _strMinSleepCycles.empty() || _strMinSleepCycles == RuleParamConstant::ALL;
}

bool LayoverRestLimitByTimeZoneForEvaFdRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

//判断Segment是否满足任务类型（计算BLH的任务类型）
bool LayoverRestLimitByTimeZoneForEvaFdRuleParam::MatchSegmentAssignments(const Segment& segment) const {
	if (_segmentAssignments.empty()) {
		return true;
	}
	string assignment = segment.getAssignment();
	auto iter = std::find(_segmentAssignments.cbegin(), _segmentAssignments.cend(), assignment);
	return iter != _segmentAssignments.cend();
}

//匹配Pairing中FLY Duty数量
bool LayoverRestLimitByTimeZoneForEvaFdRuleParam::MatchPairingDutyNum(const Pairing& pairing) const {
	bool existDHD = false;
	int dutyNum = 0;
	const auto& duties = pairing.getDutyVec();
	for (auto& duty : duties) {
		if (duty->getAssignment() == "FLY") {
			dutyNum++;
		}
		for(auto& segment : duty->getSegments()) {
			if (segment->isDeadhead()) {
				existDHD = true;
				break;
			}
		}
	}
	return !existDHD && dutyNum >= this->_minNumOfPairingDuty;
}

//判断最小时区差,Pairing中任何落地机场与Home Base时区差
bool LayoverRestLimitByTimeZoneForEvaFdRuleParam::MatchMinTimeZoneGap(const Pairing& pairing, const int baseOffsetTZMinutes) const {
	auto segments = const_cast<Pairing*>(&pairing)->getSegments();
	for (auto& segment : segments) {
		int arrOffsetTZMinutes = SegmentUtils::GetTimeZoneOffsetByArr(*segment, this->GetRule()->GetDataContext());
		int gap = TimezoneUtils::abs(arrOffsetTZMinutes - baseOffsetTZMinutes);
		if (gap >= this->_minTimeZoneGapMinutes) {
			return true;
		}
	}
	return false;
}

bool LayoverRestLimitByTimeZoneForEvaFdRuleParam::CheckMinRestAtLayover(const Pairing& pairing) const {
	bool valid = false;
	for (int i = 0; i < (int)pairing.getDutyVec().size() - 1; i++) {
		Duty* currDuty = pairing.getDuty(i);
		Duty* nextDuty = pairing.getDuty(i+1);

		if (CheckMinRestAtLayover(currDuty, nextDuty)) {
			valid = true;
			break;
		}
	}
	return valid;
}

bool LayoverRestLimitByTimeZoneForEvaFdRuleParam::CheckMinRestAndMinWOCLLayover(const Pairing& pairing) const {
	bool valid = false;
	for (int i = 0; i < (int)pairing.getDutyVec().size() - 1; i++) {
		Duty* currDuty = pairing.getDuty(i);
		Duty* nextDuty = pairing.getDuty(i + 1);

		if (CheckMinRestAtLayover(currDuty, nextDuty) || CheckMinWOCLAtLayover(currDuty, nextDuty)) {
			valid = true;
			break;
		}
	}
	return valid;
}

bool LayoverRestLimitByTimeZoneForEvaFdRuleParam::CheckMinWOCLAtLayover(const Pairing& pairing) const {
	bool valid = false;
	for (int i = 0; i < (int)pairing.getDutyVec().size() - 1; i++) {
		Duty* currDuty = pairing.getDuty(i);
		Duty* nextDuty = pairing.getDuty(i + 1);

		if (CheckMinWOCLAtLayover(currDuty, nextDuty)) {
			valid = true;
			break;
		}
	}
	return valid;

}

bool LayoverRestLimitByTimeZoneForEvaFdRuleParam::CheckMinRestAtLayover(const Duty* currDuty, const Duty* nextDuty) const {
	int actualRest = DutyUtils::GetActualRestMinutes(currDuty, nextDuty, this->GetRule()->GetDataContext());
	return actualRest >= _layoverMinRestMinutes;
}

bool LayoverRestLimitByTimeZoneForEvaFdRuleParam::CheckMinWOCLAtLayover(const Duty* currDuty, const Duty* nextDuty) const {
	int offsetTZMinutes = SegmentUtils::GetTimeZoneOffsetByArr(*(currDuty->getLastSegment()), this->GetRule()->GetDataContext());
	time_t startTime = currDuty->getEndTimeUtcAct() + offsetTZMinutes * 60 + currDuty->getActualDropoffMin() * 60;
	time_t endTime = nextDuty->getStartTimeUtcAct() + offsetTZMinutes * 60 - nextDuty->getActualPickupMin() * 60;
	int woclNums = GetSleepCycleNum(startTime, endTime);
	return woclNums >= _minSleepCycles;
}

bool LayoverRestLimitByTimeZoneForEvaFdRuleParam::MatchParam(const Pairing& pairing, const int baseOffsetTZMinutes) const {

	if (!MatchPairingDutyNum(pairing)) {
		return false;
	}

	if (!MatchMinTimeZoneGap(pairing, baseOffsetTZMinutes)) {
		return false;
	}

	return true;
}

//检查是否满足参数
int LayoverRestLimitByTimeZoneForEvaFdRuleParam::CheckParam(const Pairing& pairing) const {
	int warnCode = (int)WarnCode::NO_WARN;

	if (!ignoreMinRestAtLayover() && !ignoreMinWOCLAtLayover()) {
		//“Layover最小休息时长（分钟数）” 和 “Layover最小WOCL次数” 都配置，都违规才能算违规，否则不算违规
		if (!CheckMinRestAndMinWOCLLayover(pairing)) {
			warnCode = (int)WarnCode::MIN_REST_AT_LAYOVER_WARN | (int)WarnCode::MIN_WOCL_AT_LAYOVER_WARN;
		}
	}
	else if (!ignoreMinRestAtLayover()) {
		//仅配置“Layover最小休息时长（分钟数）”
		if (!CheckMinRestAtLayover(pairing)) {
			warnCode = (int)WarnCode::MIN_REST_AT_LAYOVER_WARN;
		}
	}
	else if (!ignoreMinWOCLAtLayover()) {
		//仅配置“Layover最小WOCL次数”
		if (!CheckMinWOCLAtLayover(pairing)) {
			warnCode = (int)WarnCode::MIN_WOCL_AT_LAYOVER_WARN;
		}
	}
	return warnCode;
}



int LayoverRestLimitByTimeZoneForEvaFdRuleParam::GetSleepCycleNum(const time_t startTimeLoc, const time_t endTimeLoc) const {

	int numberOfSleepCycles = 0;
	int secondsOfDay = 3600 * 24;

	/*算法思路：首先转化成 本地时间段 [startTimeLoc, endTimeLoc]，该时间段中间每天（不包含第一天和最后一天）必然满足本地夜晚
	  因此 "本地夜晚天数" = IF("第一天满足本地夜晚", 1, 0) + IF("最后一天满足本地夜晚", 1, 0) + "中间天数"
	  备注：IF(条件，条件为true返回，条件为false返回)
	  备注：第一天 和 最后一天 是同一天 不能在累加
	*/

	//步骤1：获得开始计算第一天startLocalDay，以及结束最后一天（结束日期）endLocalDay
	//开始日期（本地时间：天）
	time_t startLocalDay = TimeUtils::Floor(startTimeLoc, ChronoUnit::DAYS);
	//结束日期 + 1（本地时间：天）
	time_t endLocalDay = TimeUtils::Floor(endTimeLoc, ChronoUnit::DAYS) + secondsOfDay;

	int intervalDayNums = static_cast<int>(endLocalDay - startLocalDay) / secondsOfDay;

	for (int i = 0; i < intervalDayNums; i++) {
		const auto& checkStartTime = startLocalDay + (time_t)i * secondsOfDay + (time_t)_sleepCycleStart * 60;
		const auto& checkEndTime = startLocalDay + (time_t)(i + 1) * secondsOfDay + (time_t)_sleepCycleEnd * 60;
		if (TimeUtils::IsAbsoluteTimesInRange(checkStartTime, checkEndTime, startTimeLoc, endTimeLoc)) {
			numberOfSleepCycles++;
		}
	}


	return numberOfSleepCycles;

}