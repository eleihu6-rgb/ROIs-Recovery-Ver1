/**
 * @file CalculateAirportRestFaciltyRuleParam.h
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
#include "CalculateAirportRestFaciltyRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../constant/Constants.h"

using namespace std;

void CalculateAirportRestFaciltyRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::PAIRING_BASES):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _pairingBases);
				}
				break;
			case enum_to_underlying(ParamLocation::AIRPORTS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _airports);
				}
				break;
			case enum_to_underlying(ParamLocation::IS_SPLIT_DUTY): {
				_isSplitDuty = (substr == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(substr == RuleParamConstant::YES);
				break;
			}
			case enum_to_underlying(ParamLocation::TRANSIT_DURATION_RANGES): {
				_transitDurationRanges = substr;

				vector<string> splitstrs;
				split(_transitDurationRanges.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_transitDurationMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_transitDurationMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::AIRPORT_REST_FACILTY):
				_airportRestFacilty = substr.empty() ? RuleParamConstant::ALL : substr;
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

void CalculateAirportRestFaciltyRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Pairing Bases,Airports,is Split Duty,Transit Duration Ranges,Airport Rest Facilty
		if (header == "PAIRING BASES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _pairingBases);
			}
		}
		else if (header == "AIRPORTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _airports);
			}
		}
		else if (header == "IS SPLIT DUTY") {
			_isSplitDuty = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "TRANSIT DURATION RANGES") {
			_transitDurationRanges = headeValue;

			vector<string> splitstrs;
			split(_transitDurationRanges.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_transitDurationMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_transitDurationMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "AIRPORT REST FACILTY") {
			_airportRestFacilty = headeValue;
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}


//判断是否满足所在基地条件
bool CalculateAirportRestFaciltyRuleParam::MatchPairingHomeBase(const Segment& segment, const std::string& base) const {
	if (_pairingBases.empty()) {
		return true;
	}

	if (!base.empty()) {
        // if PO mode, extract the base string from pairing and passed to this predicate
		auto iter = std::find(_pairingBases.cbegin(), _pairingBases.cend(), base);
		return iter != _pairingBases.cend();
	}
	// if editor mode, base is extracted from the segment's pairing
	Pairing *pairing = this->GetRule()->GetDataContext()->pairingIdMap[segment.getPairingId()];
	if (pairing == nullptr) {
		spdlog::error("Pairing({}) do not exist.", segment.getPairingId());
		return true;
	}
	auto iter = std::find(_pairingBases.cbegin(), _pairingBases.cend(), pairing->getBase());
	return iter != _pairingBases.cend();
}

//判断是否可以进行中转的机场
bool CalculateAirportRestFaciltyRuleParam::MatchAirports(const Segment& segment) const {
	if (_airports.empty()) {
		return true;
	}
	const string& station = segment.getArrStation();
	return std::find(_airports.cbegin(), _airports.cend(), station) != _airports.cend();
}

bool CalculateAirportRestFaciltyRuleParam::MatchIsSplitDuty(const Segment& segment) const {
	if (_isSplitDuty == nullptr) {
		return true;
	}
	return (segment.isSplitDuty() == *_isSplitDuty);
}
//判断连接时间是否满足
bool CalculateAirportRestFaciltyRuleParam::MatchTransitDuration(const Segment& currSegment, const Segment& nextSegment) const {
	if (_transitDurationRanges == RuleParamConstant::ALL) {
		return true;
	}
	int transitDurationInSecs = SegmentUtils::GetTransitDurationInSecs(&currSegment, &nextSegment);

	return transitDurationInSecs >= _transitDurationMinutesLower * 60
		&& transitDurationInSecs < _transitDurationMinutesUpper * 60;
}

//匹配规则参数是否满足
bool CalculateAirportRestFaciltyRuleParam::MatchParam(const Segment& currSegment, const Segment& nextSegment, const std::string& base) const {

	if (!MatchPairingHomeBase(currSegment, base)) {
		return false;
	}

	if (!MatchAirports(currSegment)) {
		return false;
	}

	if (!MatchIsSplitDuty(currSegment)) {
		return false;
	}

	if (!MatchTransitDuration(currSegment, nextSegment)) {
		return false;
	}

	return true;
}
