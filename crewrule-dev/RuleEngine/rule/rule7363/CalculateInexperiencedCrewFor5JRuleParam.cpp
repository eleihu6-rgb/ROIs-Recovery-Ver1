/**
 * @file CalculateInexperiencedCrewFor5JRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CalculateInexperiencedCrewFor5JRuleParam.h"
#include "CrewDB.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../constant/Constants.h"

using namespace std;

void CalculateInexperiencedCrewFor5JRuleParam::ParseParam(const std::string& paramString) {
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
			case enum_to_underlying(ParamLocation::AIRPORT_LIST): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _airports);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::BLH_RANGE): {
				if (substr != RuleParamConstant::ALL) {
					_blhRange = substr;
					vector<string> blhRangeVec;
					split(substr, '-', blhRangeVec);
					if (blhRangeVec.size() == 2) {
						_blhRangeLower = TimeUtils::hhmmToMinutes(blhRangeVec[0]);
						_blhRangeUpper = TimeUtils::hhmmToMinutes(blhRangeVec[1]);
					}
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_AIRPORT_OPERATING): {
				if (substr != RuleParamConstant::ALL) {
					_minAirportOperating = atoi(substr.c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_OPERATING_LEG): {
				if (substr != RuleParamConstant::ALL) {
					_minOperatingLeg = atoi(substr.c_str());
				}
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			}
		}
	}
}

void CalculateInexperiencedCrewFor5JRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Duty Compositions,Duty Assignments,Flight Compositions,Segment Assignments,Segment Fleets,Segment Sub-Fleets,In-Flight Wait Time,Post-Activity Time
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
		else if (header == "AIRPORT LIST") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _airports);
			}
		}
		else if (header == "BLH RANGE") {
			if (headeValue != RuleParamConstant::ALL) {
				_blhRange = headeValue;
				vector<string> blhRangeVec;
				split(headeValue, '-', blhRangeVec);
				if (blhRangeVec.size() == 2) {
					_blhRangeLower = TimeUtils::hhmmToMinutes(blhRangeVec[0]);
					_blhRangeUpper = TimeUtils::hhmmToMinutes(blhRangeVec[1]);
				}
			}
		}
		else if (header == "MIN AIRPORT OPERATING") {
			if (headeValue != RuleParamConstant::ALL) {
				_minAirportOperating = atoi(headeValue.c_str());
			}
		}
		else if (header == "MIN OPERATING LEG") {
			if (headeValue != RuleParamConstant::ALL) {
				_minOperatingLeg = atoi(headeValue.c_str());
			}
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CalculateInexperiencedCrewFor5JRuleParam::MatchCrewQualification(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const {
	std::vector<string> positions;
	if (!roster->isAllValid(_bases, _ranks, _fleets, _teams, positions)) {
		return false;
	}
	return true;
}

//匹配参数
bool CalculateInexperiencedCrewFor5JRuleParam::MatchParam(const Segment* segment) const {
	if (!MatchAirport(segment))
		return false;

	return true;
}

bool CalculateInexperiencedCrewFor5JRuleParam::MatchAirport(const Segment* segment) const {

	if (_airports.empty() || _airports[0].empty() || _airports[0] == "*") {
		return true;
	}

	string dep = segment->getDepStation();
	string arv = segment->getArrStation();

	if (find(_airports.begin(), _airports.end(), dep) != _airports.end() || find(_airports.begin(), _airports.end(), arv) != _airports.end()) {
		return true;
	}
	return false;
}

bool CalculateInexperiencedCrewFor5JRuleParam::MatchMinOperating(const int totalBlh, const int totalFltNum, const int totalAirportOperatingNum) const {
	if (totalBlh >= _blhRangeLower && totalBlh < _blhRangeUpper && totalFltNum >= _minOperatingLeg && totalAirportOperatingNum >= _minAirportOperating) {
		return true;
	}
	return false;
}