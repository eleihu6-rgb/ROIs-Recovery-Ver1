/**
 * @file CalculateMaxFdpExtensionOfCcForTGRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <algorithm>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CalculateMaxFdpExtensionOfCcForTGRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"

using namespace std;

void CalculateMaxFdpExtensionOfCcForTGRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::SEGMENT_ASSIGNMENTS): {
				_segmentAssignments = substr;
				_segmentAssignmentsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::DUTY_BY_FLIGHT_NUMBERS): {
				_strDutyByFlightNumbers = substr;
				if (substr != RuleParamConstant::ALL) {
					vector<string> fltNumsList;
					split(substr, '|', fltNumsList);
					for (auto& strDutyFltNums : fltNumsList) {
						vector<string> dutyFltNums;
						split(strDutyFltNums, '-', dutyFltNums);
						_dutyByFlightNumbers.emplace_back(dutyFltNums);
					}
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DUTY_REST_RANGE_IN_FLIGHT): {
				_dutyRestRangeInFlight = substr;
				_dutyRestRangeInFlightMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::REST_FACILTY): {
				_restFacilty = substr;
				break;
			}
			case enum_to_underlying(ParamLocation::FT_OFFSET_PER_SEGMENT): {
				_ftOffsetPerSegment = substr;
				_ftOffsetPerSegmentMinutes = TimeUtils::hhmmToMinutes(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::FT_DISCOUNT_DIVISOR): {
				_ftDiscountDivisor = atoi(substr.c_str());
				if (_ftDiscountDivisor <= 0) {
					_ftDiscountDivisor = 1;
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MAX_FDP): {
				_maxFDP = substr;
				_maxFDPMinutes = TimeUtils::hhmmToMinutes(substr.c_str());
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

void CalculateMaxFdpExtensionOfCcForTGRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Segment Assignments,Duty by Flight Numbers,Duty Rest Range in Flight,Rest Facilty,FT Offset per Segment,FT Discount Divisor,Max FDP
		if (header == "SEGMENT ASSIGNMENTS") {
			_segmentAssignments = headeValue;
			_segmentAssignmentsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "DUTY BY FLIGHT NUMBERS") {
			_strDutyByFlightNumbers = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				vector<string> fltNumsList;
				split(headeValue, '|', fltNumsList);
				for (auto& strDutyFltNums : fltNumsList) {
					vector<string> dutyFltNums;
					split(strDutyFltNums, '-', dutyFltNums);
					_dutyByFlightNumbers.emplace_back(dutyFltNums);
				}
			}
		}
		else if (header == "DUTY REST RANGE IN FLIGHT") {
			_dutyRestRangeInFlight = headeValue;
			_dutyRestRangeInFlightMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "REST FACILTY") {
			_restFacilty = headeValue;
		}
		else if (header == "FT OFFSET PER SEGMENT") {
			_ftOffsetPerSegment = headeValue;
			_ftOffsetPerSegmentMinutes = TimeUtils::hhmmToMinutes(headeValue.c_str());
		}
		else if (header == "FT DISCOUNT DIVISOR") {
			_ftDiscountDivisor = atoi(headeValue.c_str());
			if (_ftDiscountDivisor <= 0) {
				_ftDiscountDivisor = 1;
			}
		}
		else if (header == "MAX FDP") {
			_maxFDP = headeValue;
			_maxFDPMinutes = TimeUtils::hhmmToMinutes(headeValue.c_str());
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CalculateMaxFdpExtensionOfCcForTGRuleParam::MatchDutyByFlightNumbers(const Duty& duty) const {
	if (_dutyByFlightNumbers.empty()) {
		return true;
	}
	vector<string> fltNums;
	for (auto& segment : duty.getSegmentsRead()) {
		if (!_segmentAssignmentsMatch.Match(*segment)) {
			continue;
		}
		fltNums.emplace_back(segment->getFlightNumber());
	}

	for (auto& dutyByFlightNumber : _dutyByFlightNumbers) {
		if (StringUtils::Intersect(fltNums, dutyByFlightNumber)) {
			return true;
		}
	}
	return false;
}

//匹配Duty的机上休息时长
bool CalculateMaxFdpExtensionOfCcForTGRuleParam::MatchDutyRestRangeInFlight(const Duty& duty) const {
	int totalBlk = 0;
	for (auto& segment : duty.getSegments()) {
		if (!_segmentAssignmentsMatch.Match(*segment)) {
			continue;
		}
		if (!MatchRestFacilty(*segment)) {
			continue;
		}
		totalBlk += (int)segment->getBlkMinutes();
	}
	int dutyRestInFlight = 0;
	if (totalBlk > this->_ftOffsetPerSegmentMinutes) {
		dutyRestInFlight = static_cast<int>((totalBlk - this->_ftOffsetPerSegmentMinutes) * 1.0 / this->_ftDiscountDivisor);
	}
	return _dutyRestRangeInFlightMatch.Match(dutyRestInFlight);
}

//匹配机上休息设施
bool CalculateMaxFdpExtensionOfCcForTGRuleParam::MatchRestFacilty(const Segment& segment) const {
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

bool CalculateMaxFdpExtensionOfCcForTGRuleParam::MatchMaxFDP(const Duty& duty, const long callinSBY_FDPMins) const {
	long actFDPMinutes = duty.getFDPInSecs() / 60;
	actFDPMinutes += callinSBY_FDPMins;
	int maxFDP = duty.getLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP);
	if (maxFDP < 0) {
		//没有MaxFDP限制
		return false;
	}
	if (duty.supportDiscretionType(DiscretionType::FDP)) {
		maxFDP += duty.getManualFdpDiscretion();
	}
	if (actFDPMinutes > maxFDP) {
		return true;
	}
	return false;
}

//匹配规则参数是否满足
bool CalculateMaxFdpExtensionOfCcForTGRuleParam::MatchParam(const Duty& duty) const {

	if (!MatchDutyByFlightNumbers(duty)) {
		return false;
	}

	if (!MatchMaxFDP(duty)) {
		return false;
	}

	if (!MatchDutyRestRangeInFlight(duty)) {
		return false;
	}

	return true;
}
