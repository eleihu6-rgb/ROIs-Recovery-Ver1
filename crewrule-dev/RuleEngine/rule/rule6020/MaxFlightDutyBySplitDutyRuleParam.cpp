/**
 * @file MaxFlightDutyBySplitDutyRuleParam.h
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
#include "MaxFlightDutyBySplitDutyRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../constant/Constants.h"

using namespace std;

void MaxFlightDutyBySplitDutyRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::INCLUDE_SPLIT_DUTY_PERIOD_RANGES): {
				_includeSplitDutyPeriodRanges = substr.empty() ? RuleParamConstant::ALL : substr;

				vector<string> splitstrs;
				split(_includeSplitDutyPeriodRanges.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_includeSplitDutyPeriodMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_includeSplitDutyPeriodMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::EXCLUDE_SPLIT_DUTY_PERIOD_RANGES): {
				_excludeSplitDutyPeriodRanges = substr.empty() ? RuleParamConstant::ALL : substr;

				vector<string> splitstrs;
				split(_excludeSplitDutyPeriodRanges.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_excludeSplitDutyPeriodMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_excludeSplitDutyPeriodMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::STATION_REST_FACILTY):
				 _stationRestFacilty = substr.empty() ? RuleParamConstant::ALL : substr;
				break;
			case enum_to_underlying(ParamLocation::SPLIT_DUTY_REST_DURATION_RANGES): {
				_splitRestDurationRanges = substr.empty() ? RuleParamConstant::ALL : substr;;

				vector<string> splitstrs;
				split(_splitRestDurationRanges.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_splitRestDurationMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_splitRestDurationMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_SPLIT_REST):
				_minSplitRest = substr.empty() ? RuleParamConstant::ALL : substr;
				_minSplitRestMinutes = _minSplitRest == RuleParamConstant::ALL ? 0 : TimeUtils::hhmmToMinutes(_minSplitRest);
				break;
			case enum_to_underlying(ParamLocation::INCREASE_IN_FDP):
				_increaseInFDP = substr.empty() ? RuleParamConstant::ALL : substr;
				_increaseInFDPMinutes = (_increaseInFDP == RuleParamConstant::ALL ? 0 : TimeUtils::hhmmToMinutes(_increaseInFDP));
				break;
			case enum_to_underlying(ParamLocation::PERCENT_INCREASE_IN_FDP):
				_percentIncreaseInFDP = substr.empty() || substr == RuleParamConstant::ALL ? 0 : atof(substr.c_str());
				break;
			case enum_to_underlying(ParamLocation::MAX_INCREASE_IN_FDP):
				_maxIncreaseInFDP = substr.empty() ? RuleParamConstant::ALL : substr;
				_maxIncreaseInFDPMinutes = _maxIncreaseInFDP == RuleParamConstant::ALL ? 0 : TimeUtils::hhmmToMinutes(_maxIncreaseInFDP);
				break;
			case enum_to_underlying(ParamLocation::MAX_FDP):
				_maxFDP = substr.empty() ? RuleParamConstant::ALL : substr;
				_maxFDPMinutes = _maxFDP == RuleParamConstant::ALL ? 0 : TimeUtils::hhmmToMinutes(_maxFDP);
				break;
			case enum_to_underlying(ParamLocation::MAX_FDP_AFTER_SPLIT_DUTY_REST_PERIOD):
				_maxFDPAfterTransit = substr.empty() ? RuleParamConstant::ALL : substr;
				_maxFDPAfterTransitMinutes = (_maxFDPAfterTransit == RuleParamConstant::ALL ? 0 : TimeUtils::hhmmToMinutes(substr));
				break;
			case enum_to_underlying(ParamLocation::DELTA_FDP_AFTER_REST):
				_deltaFDPAfterRest = substr.empty() ? RuleParamConstant::ALL : substr;
				_deltaFDPMinutesAfterRest = (_deltaFDPAfterRest == RuleParamConstant::ALL ? 0 : TimeUtils::hhmmToMinutes(substr));
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

void MaxFlightDutyBySplitDutyRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Include Split Duty Period Ranges,Exclude Split Duty Period Ranges,Station Rest Facilty,Split Duty Rest Duration Ranges,Min Rest,Increase in FDP,Percent Increase in FDP,Max Increase in FDP,Max FDP,Max FDP After Split Duty Rest Period
		if (header == "INCLUDE SPLIT DUTY PERIOD RANGES") {
			_includeSplitDutyPeriodRanges = headeValue.empty() ? RuleParamConstant::ALL : headeValue;

			vector<string> splitstrs;
			split(_includeSplitDutyPeriodRanges.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_includeSplitDutyPeriodMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_includeSplitDutyPeriodMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "EXCLUDE SPLIT DUTY PERIOD RANGES") {
			_excludeSplitDutyPeriodRanges = headeValue.empty() ? RuleParamConstant::ALL : headeValue;

			vector<string> splitstrs;
			split(_excludeSplitDutyPeriodRanges.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_excludeSplitDutyPeriodMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_excludeSplitDutyPeriodMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "STATION REST FACILTY") {
			_stationRestFacilty = headeValue.empty() ? RuleParamConstant::ALL : headeValue;
		}
		else if (header == "SPLIT DUTY REST DURATION RANGES") {
			_splitRestDurationRanges = headeValue.empty() ? RuleParamConstant::ALL : headeValue;

			vector<string> splitstrs;
			split(_splitRestDurationRanges.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_splitRestDurationMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_splitRestDurationMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "MIN REST" || header == "MIN SPLIT REST") {
			_minSplitRest = headeValue.empty() ? RuleParamConstant::ALL : headeValue;
			_minSplitRestMinutes = _minSplitRest == RuleParamConstant::ALL ? INT_MAX : TimeUtils::hhmmToMinutes(_minSplitRest);
		}
		else if (header == "INCREASE IN FDP") {
			_increaseInFDP = headeValue.empty() ? RuleParamConstant::ALL : headeValue;
			_increaseInFDPMinutes = (_increaseInFDP == RuleParamConstant::ALL ? 0 : TimeUtils::hhmmToMinutes(_increaseInFDP));
		}
		else if (header == "PERCENT INCREASE IN FDP") {
			_percentIncreaseInFDP = headeValue.empty() || headeValue == RuleParamConstant::ALL ? 0 : atof(headeValue.c_str());
		}
		else if (header == "MAX INCREASE IN FDP") {
			_maxIncreaseInFDP = headeValue.empty() ? RuleParamConstant::ALL : headeValue;
			_maxIncreaseInFDPMinutes = _maxIncreaseInFDP == RuleParamConstant::ALL ? 0 : TimeUtils::hhmmToMinutes(_maxIncreaseInFDP);
		}
		else if (header == "MAX FDP") {
			_maxFDP = headeValue.empty() ? RuleParamConstant::ALL : headeValue;
			_maxFDPMinutes = (_maxFDP == RuleParamConstant::ALL ? 0 : TimeUtils::hhmmToMinutes(_maxFDP));
		}
		else if (header == "MAX FDP AFTER SPLIT DUTY REST PERIOD") {
			_maxFDPAfterTransit = headeValue.empty() ? RuleParamConstant::ALL : headeValue;
			_maxFDPAfterTransitMinutes = (_maxFDPAfterTransit == RuleParamConstant::ALL ? 0 : TimeUtils::hhmmToMinutes(headeValue));
		}
		else if (header == "DELTA FDP AFTER REST") {
			_deltaFDPAfterRest = headeValue.empty() ? RuleParamConstant::ALL : headeValue;
			_deltaFDPMinutesAfterRest = (_deltaFDPAfterRest == RuleParamConstant::ALL ? 0 : TimeUtils::hhmmToMinutes(headeValue));
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			spdlog::critical("Rule Param parsing error at rule:{0:>5}, cannot parse header:{}", 0 + RuleFuncId, header);
	}
}

//判断航班过站时间段是否满足“包含过站时间段范围”
bool MaxFlightDutyBySplitDutyRuleParam::MatchIncludeSplitDutyPeriodRanges(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit) const {
	if (this->_includeSplitDutyPeriodRanges == RuleParamConstant::ALL) {
		return true;
	}

	int offsetTZMinutes = SegmentUtils::GetTimeZoneOffsetByArr(*currSegment, this->GetRule()->GetDataContext());

	time_t restStartTimeUtc = 0, restEndTimeUtc = 0;
	SegmentUtils::GetActualRestStartAndEndTimeUtc(restStartTimeUtc, restEndTimeUtc, currSegment, nextSegment, longTransit);

	time_t restStartTimeLoc = restStartTimeUtc + (time_t)offsetTZMinutes * 60;
	time_t restEndTimeLoc = restEndTimeUtc + (time_t)offsetTZMinutes * 60;
	//判断时间范围 [_includeSplitDutyPeriodMinutesLower, _includeSplitDutyPeriodMinutesUpper)  
	// 等价于 [_includeSplitDutyPeriodMinutesLower, _includeSplitDutyPeriodMinutesUpper - 1]
	return TimeUtils::IsTimesCovered(restStartTimeLoc, restEndTimeLoc,
		this->_includeSplitDutyPeriodMinutesLower, (this->_includeSplitDutyPeriodMinutesUpper - 1));
}

//判断航班过站时间段是否满足“不包含过站时间段范围”
bool MaxFlightDutyBySplitDutyRuleParam::MatchExcludeSplitDutyPeriodRanges(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit) const {
	if (this->_excludeSplitDutyPeriodRanges == RuleParamConstant::ALL) {
		return true;
	}

	int offsetTZMinutes = SegmentUtils::GetTimeZoneOffsetByArr(*currSegment, this->GetRule()->GetDataContext());
	
	time_t restStartTimeUtc = 0, restEndTimeUtc = 0;
	SegmentUtils::GetActualRestStartAndEndTimeUtc(restStartTimeUtc, restEndTimeUtc, currSegment, nextSegment, longTransit);

	time_t restStartTimeLoc = restStartTimeUtc + (time_t)offsetTZMinutes * 60;
	time_t restEndTimeLoc = restEndTimeUtc + (time_t)offsetTZMinutes * 60;
	//判断时间范围不包括 [_excludeSplitDutyPeriodMinutesLower, _excludeSplitDutyPeriodMinutesUpper)  
	// 等价于 不包括 [_excludeSplitDutyPeriodMinutesLower, _excludeSplitDutyPeriodMinutesUpper - 1]
	return !TimeUtils::IsTimesCovered(restStartTimeLoc, restEndTimeLoc,
		this->_excludeSplitDutyPeriodMinutesLower, (this->_excludeSplitDutyPeriodMinutesUpper - 1));
}

//判断航班落地机场的休息设施等级是否满足
bool MaxFlightDutyBySplitDutyRuleParam::MatchStationRestFacilty(const Segment* currSegment) const {
	return this->_stationRestFacilty == RuleParamConstant::ALL 
		|| currSegment->getArrStationRestFacilty() == this->_stationRestFacilty;
}

//判断航班过站休息时长是否满足“过站时长(分钟数)”
bool MaxFlightDutyBySplitDutyRuleParam::MatchSplitRestDurationRanges(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit) const {
	if (this->_splitRestDurationRanges == RuleParamConstant::ALL) {
		return true;
	}

	//过站时长秒数
	int transitDuration = SegmentUtils::GetActualRestMinutes(currSegment, nextSegment, longTransit);
	//转化成秒进行比较
	return (transitDuration >= _splitRestDurationMinutesLower) &&
		(transitDuration < _splitRestDurationMinutesUpper);
}

bool MaxFlightDutyBySplitDutyRuleParam::MatchMinFDPAfterTransit(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit, const Duty* duty) const {
	if (this->_maxFDPAfterTransit == RuleParamConstant::ALL) {
		return true;
	}
	if (nextSegment == nullptr) {
		return true;
	}
	//当前Segment之后剩余实际FDP时长
	time_t restStartTimeUtc = 0;
	time_t restEndTimeUtc = 0;
	SegmentUtils::GetActualRestStartAndEndTimeUtc(restStartTimeUtc, restEndTimeUtc, currSegment, nextSegment, longTransit);
	time_t nextSegmentFDPStartTimeUtc = SegmentUtils::GetNextSegmentFDPStartTimeUtc(currSegment, nextSegment, longTransit, false);
	int fdpAfterTransit = static_cast<int>(duty->getEndTimeUtcAct() - nextSegmentFDPStartTimeUtc);
	this->GetRule()->getRuleViolation().SetParam("fdpAfterTransitMinutes", TimeUtils::MinutesTohhmm(fdpAfterTransit/60));
	return fdpAfterTransit <= _maxFDPAfterTransitMinutes * 60;
}

/**
* @param currSegment Duty当前正在检查的Segment
* @param nextSegment Duty当前Segment的下一个Segment
* @return true-合规，false-不合规
*/
bool MaxFlightDutyBySplitDutyRuleParam::MatchMinSplitRest(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit) const {
	if (this->_minSplitRest == RuleParamConstant::ALL) {
		return true;
	}
	//休息ODP时长分钟数
	int restDuration = SegmentUtils::GetActualRestMinutes(currSegment, nextSegment, longTransit);
	return restDuration >= _minSplitRestMinutes;
}


int MaxFlightDutyBySplitDutyRuleParam::CheckRule(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit, const Duty* duty) const {
	int warnCode = (int)WarnCode::NO_WARN;
	if (!MatchMinFDPAfterTransit(currSegment, nextSegment, longTransit, duty)) {
		warnCode = warnCode | (int)WarnCode::MIN_FDP_AFTER_TRANSIT_WARN;
	}

	if (this->_includeSplitDutyPeriodRanges != RuleParamConstant::ALL && !MatchMinSplitRest(currSegment, nextSegment, longTransit)) {
		warnCode = warnCode | (int)WarnCode::MIN_SPLIT_REST_WARN;
	}

	return warnCode;
}

bool MaxFlightDutyBySplitDutyRuleParam::MatchParam(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit, const Duty* duty) const {

	if (!MatchIncludeSplitDutyPeriodRanges(currSegment, nextSegment, longTransit)) {
		return false;
	}
		
	if (!MatchExcludeSplitDutyPeriodRanges(currSegment, nextSegment, longTransit)) {
		return false;
	}

	if (!MatchSplitRestDurationRanges(currSegment, nextSegment, longTransit)) {
		return false;
	}
			
	if (!MatchStationRestFacilty(currSegment)) {
		return false;
	}

	if (!MatchMinFDPAfterTransit(currSegment, nextSegment, longTransit, duty)) {
		return false;
	}

	return true;
}

bool MaxFlightDutyBySplitDutyRuleParam::MatchParamByCheck(const Segment* currSegment, const Segment* nextSegment, const long_transit* longTransit, const Duty* duty) const {

	if (!MatchIncludeSplitDutyPeriodRanges(currSegment, nextSegment, longTransit)) {
		return false;
	}

	if (!MatchExcludeSplitDutyPeriodRanges(currSegment, nextSegment, longTransit)) {
		return false;
	}

	if (!MatchSplitRestDurationRanges(currSegment, nextSegment, longTransit)) {
		return false;
	}

	if (!MatchStationRestFacilty(currSegment)) {
		return false;
	}

	return true;
}