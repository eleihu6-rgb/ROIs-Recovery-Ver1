/**
 * @file MaxFdpOnStandbyOfCcForTGRuleParam.h
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
#include "spdlog/spdlog.h"
#include "MaxFdpOnStandbyOfCcForTGRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "../utils/CompositionRule.h"
#include "../utils/SegmentUtils.h"
#include "../utils/BaseUtils.h"


using namespace std;

void MaxFdpOnStandbyOfCcForTGRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::IS_HOME_BASE): {
				_isHomeBase = (substr == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(substr == RuleParamConstant::YES);
				break;
			}
			case enum_to_underlying(ParamLocation::STANDBY_ASSIGNMENT_GROUPS): {
				_standbyAssignmentGroups = substr;
				_standbyAssignmentGroupsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::STANDBY_ASSIGNMENTS): {
				_standbyAssignments = substr;
				_standbyAssignmentsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::STANDBY_START_TIME_RANGES): {
				_standbyStartTimeRanges = substr.empty() ? RuleParamConstant::ALL : substr;

				vector<string> splitstrs;
				split(_standbyStartTimeRanges.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_standbyStartTimeHHmmLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_standbyStartTimeHHmmUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::INCLUDING_SPLIT_DUTY): {
				_isIncludingSplitDuty = substr;
				_isIncludingSplitDutyMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::SEGMENT_ASSIGNMENTS): {
				_segmentAssignments = substr;
				_segmentAssignmentsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::REST_FACILTY): {
				_restFacilty = substr;
				break;
			}
			case enum_to_underlying(ParamLocation::DUTY_REST_RANGE_IN_FLIGHT): {
				_dutyRestRangeInFlight = substr;
				_dutyRestRangeInFlightMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::FT_OFFSET_PER_SEGMENT): {
				_ftOffsetPerSegment = substr;
				_ftOffsetPerSegmentMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::FT_DISCOUNT_DIVISOR): {
				_ftDiscountDivisor = (substr == RuleParamConstant::ALL) ? 1 : atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::STANDBY_DURATION_AFTER_HHMM): {
				_standbyDurationAfterHHmm = substr;
				_standbyDurationAfterHHmmMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::GAP_OF_STANDBY_DURATION): {
				_gapOfStandbyDuration = substr;
				_gapOfStandbyDurationMinutes = TimeUtils::hhmmToMinutes(substr);
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

void MaxFdpOnStandbyOfCcForTGRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//is Home Base(Y/N),Standby Assignment Groups,Standby Assignments,Standby Start Time Ranges,Including Split Duty(Y/N),Segment Assignments,Rest Facilty,Duty Rest Range in Flight,FT Offset per Segment,FT Discount Divisor,Standby Duration after HH:mm,Gap of Standby Duration
		if (header == "IS HOME BASE(Y/N)") {
			_isHomeBase = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "STANDBY ASSIGNMENT GROUPS") {
			_standbyAssignmentGroups = headeValue;
			_standbyAssignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "STANDBY ASSIGNMENTS") {
			_standbyAssignments = headeValue;
			_standbyAssignmentsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "STANDBY START TIME RANGES") {
			_standbyStartTimeRanges = headeValue.empty() ? RuleParamConstant::ALL : headeValue;

			vector<string> splitstrs;
			split(_standbyStartTimeRanges.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_standbyStartTimeHHmmLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_standbyStartTimeHHmmUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "INCLUDING SPLIT DUTY(Y/N)") {
			_isIncludingSplitDuty = headeValue;
			_isIncludingSplitDutyMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "SEGMENT ASSIGNMENTS") {
			_segmentAssignments = headeValue;
			_segmentAssignmentsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "REST FACILTY") {
			_restFacilty = headeValue;
		}
		else if (header == "DUTY REST RANGE IN FLIGHT") {
			_dutyRestRangeInFlight = headeValue;
			_dutyRestRangeInFlightMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "FT OFFSET PER SEGMENT") {
			_ftOffsetPerSegment = headeValue;
			_ftOffsetPerSegmentMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "FT DISCOUNT DIVISOR") {
			_ftDiscountDivisor = (headeValue == RuleParamConstant::ALL) ? 1 : atoi(headeValue.c_str());
		}
		else if (header == "STANDBY DURATION AFTER HH:MM") {
			_standbyDurationAfterHHmm = headeValue;
			_standbyDurationAfterHHmmMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "GAP OF STANDBY DURATION") {
			_gapOfStandbyDuration = headeValue;
			_gapOfStandbyDurationMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}


//判断是否在基地
bool MaxFdpOnStandbyOfCcForTGRuleParam::MatchHomeBase(const Duty& duty, const std::string& base) const {
	std::string pairingBase;
	if (!base.empty()) {
		// if PO mode, extract the base string from pairing and passed to this predicate
		pairingBase = base;
	}
	else {
		// if editor mode, base is extracted from the segment's pairing
		Pairing* pairing = this->GetRule()->GetDataContext()->pairingIdMap[duty.getPairingId()];
		if (pairing == nullptr) {
			spdlog::error("Pairing({}) do not exist.", duty.getPairingId());
			return true;
		}
		pairingBase = pairing->getBase();
	}
	return _isHomeBase == nullptr || BaseUtils::IsHomeBaseByBase(duty.getDepStationRead(), vector<string>(), pairingBase) == *_isHomeBase;
}

//匹配Standby开始时间段
bool MaxFdpOnStandbyOfCcForTGRuleParam::MatchStandbyStartTimeRanges(const ROSTER* standbyRoster) const {
	if (this->_standbyStartTimeRanges == RuleParamConstant::ALL) {
		return true;
	}

	return TimeUtils::IsTimesInRange(standbyRoster->getStartTimeLocAct(), _standbyStartTimeHHmmLower, _standbyStartTimeHHmmUpper);
}

//匹配机上休息设施
bool MaxFdpOnStandbyOfCcForTGRuleParam::MatchRestFacilty(const Segment& segment) const {
	if (_restFacilty == RuleParamConstant::ALL) {
		return true;
	}
	const string& station = segment.getArrStation();

	auto& dbData = this->GetRule()->GetDataContext();
	int fltRestFacility = 0;
	if (!SegmentUtils::GetRestFacility(fltRestFacility, &segment, dbData)) {
		return false;
	}

	string restFacility = StationRestFacilty::NONE;
	if (fltRestFacility == 0) {
		restFacility = StationRestFacilty::REST;
	}
	else if (fltRestFacility == 1) {
		restFacility = StationRestFacilty::SLEEP;
	}
	return _restFacilty == restFacility;
}

//匹配Duty的机上休息时长
bool MaxFdpOnStandbyOfCcForTGRuleParam::MatchDutyRestRangeInFlight(const Duty& duty) const {
	if (_dutyRestRangeInFlight.empty() || _dutyRestRangeInFlight == RuleParamConstant::ALL) {
		return true;
	}
	double dutyRestInFlight = 0;
	for (auto& segment : duty.getSegments()) {
		if (!_segmentAssignmentsMatch.Match(*segment)) {
			continue;
		}
		if (!MatchRestFacilty(*segment)) {
			continue;
		}
		double restInFlight = ((int)segment->getBlkMinutes() - this->_ftOffsetPerSegmentMinutes) * 1.0 / this->_ftDiscountDivisor;
		if (restInFlight >= 0) {
			dutyRestInFlight += restInFlight;
		}
	}
	return _dutyRestRangeInFlightMatch.Match((int)dutyRestInFlight);
}

bool MaxFdpOnStandbyOfCcForTGRuleParam::ignoreStandbyDurationAfterHHmm() const {
	return _standbyDurationAfterHHmm.empty() || _standbyDurationAfterHHmm == RuleParamConstant::ALL;
}

//匹配规则参数是否满足
bool MaxFdpOnStandbyOfCcForTGRuleParam::MatchParam(const ROSTER* standbyRoster, const Duty& duty, const string& base) const {
	
	if (!MatchHomeBase(duty, base)) {
		return false;
	}

	if (!_standbyAssignmentGroupsMatch.Match(*standbyRoster)) {
		return false;
	}

	if (!_standbyAssignmentsMatch.Match(*standbyRoster)) {
		return false;
	}

	if (!MatchStandbyStartTimeRanges(standbyRoster)) {
		return false;
	}

	if (!_isIncludingSplitDutyMatch.Match(duty.isSplitDuty())) {
		return false;
	}

	if (!MatchDutyRestRangeInFlight(duty)) {
		return false;
	}

	return true;
}
