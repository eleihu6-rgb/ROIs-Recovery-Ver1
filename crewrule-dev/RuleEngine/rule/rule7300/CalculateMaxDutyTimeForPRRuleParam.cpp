/**
 * @file CalculateMaxDutyTimeForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-07-10
**/


#include <sstream>
#include <map>
#include <climits>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CalculateMaxDutyTimeForPRRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../utils/SegmentUtils.h"
#include "../constant/Constants.h"

#include "RuleParams.h"

using namespace std;

void CalculateMaxDutyTimeForPRRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
			switch (i) {
				case enum_to_underlying(ParamLocation::COMPOSITIONS): {
					if (substr != RuleParamConstant::ALL) {
						split(substr, '|', _compositions);
					}
					break;
				}
				case enum_to_underlying(ParamLocation::OPTIONS): {
					if (substr != RuleParamConstant::ALL) {
						split(substr.c_str(), '|', _compositionOptions);
					}
					break;
				}
				case enum_to_underlying(ParamLocation::AUGMENTED): {
					_isAugmented = (substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(substr == RuleParamConstant::YES);
					break;
				}
				case enum_to_underlying(ParamLocation::NUMBER_OF_OPERATING_CREW): {
					_numOfOperatingCrew = (substr == RuleParamConstant::ALL || substr.empty()) ? nullptr : std::make_shared<int>(atoi(substr.c_str()));
					break;
				}
				case enum_to_underlying(ParamLocation::OPERATING_AIRPORTS): {
					if (substr != RuleParamConstant::ALL) {
						split(substr, '|', _operatingAirports);
					}
					break;
				}
				case enum_to_underlying(ParamLocation::OPERATING_FLEETS): {
					if (substr != RuleParamConstant::ALL) {
						split(substr, '|', _operatingFleets);
					}
					break;
				}
				case enum_to_underlying(ParamLocation::SUB_OPERATING_FLEETS): {
					if (substr != RuleParamConstant::ALL) {
						split(substr, '|', _subOperatingFleets);
					}
					break;
				}
				case enum_to_underlying(ParamLocation::DUTY_ASSIGNMENTS): {
					if (substr != RuleParamConstant::ALL) {
						split(substr, '|', _dutyAssignments);
					}
					break;
				}
				case enum_to_underlying(ParamLocation::INCLUDE_DHD_FLIGHTS): {
					_isIncludeDHDFlight = (substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(substr == RuleParamConstant::YES);
					break;
				}
				case enum_to_underlying(ParamLocation::OVERRIDEABLE): {
					_isOverrideable = (substr == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(substr == RuleParamConstant::YES);
					break;
				}
				case enum_to_underlying(ParamLocation::MAX_DP): {
					_maxDP = TimeUtils::hhmmToMinutes(substr);
					break;
				}
				case enum_to_underlying(ParamLocation::SEVERITY): {
					this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
					break;
				}
				default: {
					Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
				}
			}
        }
    }
}

void CalculateMaxDutyTimeForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	//Compositions,Options,Augmented(Y/N),Number of Operating Crew,Operating Airports,Operating Fleets,Sub Operating Fleets,Duty Assignments,Include DHD Flights(Y/N),Overrideable(Y/N),Max DP
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "COMPOSITIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _compositions);
			}
		}
		else if (header == "OPTIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _compositionOptions);
			}
		}
		else if (header == "AUGMENTED(Y/N)") {
			_isAugmented = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "NUMBER OF OPERATING CREW") {
			_numOfOperatingCrew = (headeValue == RuleParamConstant::ALL || headeValue.empty()) ? nullptr : std::make_shared<int>(atoi(headeValue.c_str()));
		}
		else if (header == "OPERATING AIRPORTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _operatingAirports);
			}
		}
		else if (header == "OPERATING FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _operatingFleets);
			}
		}
		else if (header == "SUB OPERATING FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _subOperatingFleets);
			}
		}
		else if (header == "DUTY ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyAssignments);
			}
		}
		else if (header == "INCLUDE DHD FLIGHTS(Y/N)") {
			_isIncludeDHDFlight = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "OVERRIDEABLE(Y/N)") {
			_isOverrideable = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_shared<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "MAX DP") {
			_maxDP = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CalculateMaxDutyTimeForPRRuleParam::MatchCompositionOption(const Duty& duty) const {
	if (_compositions.empty()) {
		return true;
	}
	auto& dbData = this->GetRule()->GetDataContext();

	auto dutyCompositionOptions = CompositionRule::GetCompositionOptions(&duty, dbData);
	for (auto& dutyCompositionOption : dutyCompositionOptions) {
		auto& [compId, compName, option] = dutyCompositionOption;
		auto iter = std::find(_compositions.cbegin(), _compositions.cend(), compName);
		if (iter == _compositions.cend()) {
			continue;
		}
		if (_compositionOptions.empty()) {
			return true;
		}
		else {
			auto iter = std::find(_compositionOptions.cbegin(), _compositionOptions.cend(), option);
			if (iter != _compositionOptions.cend()) {
				return true;
			}
		}
	}

	return false;
}

bool CalculateMaxDutyTimeForPRRuleParam::MatchDutyAssignments(const Duty& duty) const {
	if (_dutyAssignments.empty()) {
		return true;
	}
	string assignment = duty.getAssignment();
	auto iter = std::find(_dutyAssignments.cbegin(), _dutyAssignments.cend(), assignment);
	return iter != _dutyAssignments.cend();
}

bool CalculateMaxDutyTimeForPRRuleParam::MatchIncludeDHDFlight(const Duty& duty) const {
	if (_isIncludeDHDFlight == nullptr) {
		//忽略该参数
		return true;
	}
	bool isIncludeDHDFlight = *(_isIncludeDHDFlight.get());
	if (isIncludeDHDFlight) {
		return true;
	}
	else {
		for (auto& segment : duty.getSegmentsRead()) {
			if (SegmentUtils::IsDHD(segment)) {
				return false;
			}
		}
	}
	return true;
}

bool CalculateMaxDutyTimeForPRRuleParam::MatchOperatingAirports(const Segment* segment) const {
	if (_operatingAirports.empty()) {
		//忽略该参数
		return true;
	}
	if (segment->getAssignment() != "FLY" && segment->getAssignment() != "OPR") {
		//不是飞行航段，则直接退出
		return false;
	}
	auto iter = std::find(_operatingAirports.cbegin(), _operatingAirports.cend(), segment->getArrStationRead());
	if (iter != _operatingAirports.cend()) {
		return true;
	}
	iter = std::find(_operatingAirports.cbegin(), _operatingAirports.cend(), segment->getDepStationRead());
	if (iter != _operatingAirports.cend()) {
		return true;
	}
	return false;
}

bool CalculateMaxDutyTimeForPRRuleParam::MatchOperatingFleetsAndSubFleets(const Segment* segment) const {
	if (segment->getAssignment() != "FLY" && segment->getAssignment() != "OPR") {
		//不是飞行航段，则直接退出
		return false;
	}

	if (!_operatingFleets.empty()) {
		auto iter = std::find(_operatingFleets.cbegin(), _operatingFleets.cend(), segment->getFleetCD());
		if (iter == _operatingFleets.cend()) {
			return false;
		}
	}

	if (!_subOperatingFleets.empty()) {
		auto iter = std::find(_subOperatingFleets.cbegin(), _subOperatingFleets.cend(), segment->getSubFleet());
		if (iter == _subOperatingFleets.cend()) {
			return false;
		}
	}

	return true;
}


bool CalculateMaxDutyTimeForPRRuleParam::MatchOperatingParam(const Duty& duty) const {
	if (_operatingAirports.empty() && _operatingFleets.empty() && _subOperatingFleets.empty()) {
		//忽略该参数
		return true;
	}
	bool matchedAirport = false, matchedFleet = false;
	for (auto& segment : duty.getSegmentsRead()) {
		if (SegmentUtils::IsDHD(segment)) {
			continue;
		}
		if (!matchedAirport && MatchOperatingAirports(segment)) {
			matchedAirport = true;
		}

		if (!matchedFleet && MatchOperatingFleetsAndSubFleets(segment)) {
			matchedFleet = true;
		}
	}
	return matchedAirport && matchedFleet;
}

bool CalculateMaxDutyTimeForPRRuleParam::MatchNumOfOperatingCrew(const Duty& duty) const {
	if (_numOfOperatingCrew == nullptr) {
		return true;
	}
	auto& dbData = this->GetRule()->GetDataContext();
	int numOfOperatingCrew = INT_MAX;
	for (auto& segment : duty.getSegmentsRead()) {
		if (SegmentUtils::IsDHD(segment)) {
			continue;
		}
		int crewNum =CompositionRule::GetCrewNumOfComposition(segment, dbData);
		if (crewNum < numOfOperatingCrew) {
			numOfOperatingCrew = crewNum;
		}
	}
	return numOfOperatingCrew == *(_numOfOperatingCrew.get());
}

bool CalculateMaxDutyTimeForPRRuleParam::MatchParam(const Duty& duty) const {

	if (!MatchCompositionOption(duty)) {
		return false;
	}

	if (!MatchDutyAssignments(duty)) {
		return false;
	}

	if (!MatchIncludeDHDFlight(duty)) {
		return false;
	}

	if (!MatchOperatingParam(duty)) {
		return false;
	}
	
	if (!MatchNumOfOperatingCrew(duty)) {
		return false;
	}

	return true;
}

