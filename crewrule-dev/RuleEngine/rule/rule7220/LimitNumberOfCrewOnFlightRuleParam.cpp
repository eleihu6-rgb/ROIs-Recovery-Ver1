/**
 * @file LimitNumberOfCrewOnFlightRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "LimitNumberOfCrewOnFlightRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void LimitNumberOfCrewOnFlightRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::BASES):{
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _bases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::RANKS):{
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _ranks);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLEETS):{
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
			case enum_to_underlying(ParamLocation::FLIGHT_AIRLINE_CODES): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _flightAirlines);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ACTING_RANKS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _actingRanks);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_BLH_ON_FLIGHT): {
				_minBLHOnFlight = substr;
				_minBLHOnFlightMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::MAX_NUMBER_OF_CREW_ON_FLIGHT): {
				_maxNumOfCrew = StringUtils::stoi(substr, 0);
				break;
			}
			case enum_to_underlying(ParamLocation::SEVERITY):{
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void LimitNumberOfCrewOnFlightRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Flight Airline Codes,Acting Ranks,Min BLH on Flight,Max Number of Crew on Flight,Severity
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
		else if (header == "FLIGHT AIRLINE CODES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _flightAirlines);
			}
		}
		else if (header == "ACTING RANKS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _actingRanks);
			}
		}
		else if (header == "MIN BLH ON FLIGHT") {
			_minBLHOnFlight = headeValue;
			_minBLHOnFlightMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "MAX NUMBER OF CREW ON FLIGHT") {
			_maxNumOfCrew = StringUtils::stoi(headeValue, 0);
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool LimitNumberOfCrewOnFlightRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool LimitNumberOfCrewOnFlightRuleParam::MatchFlightAirline(const Segment* segment) const {
	if (_flightAirlines.empty() || _flightAirlines[0] == "*" || _flightAirlines[0] == "") {
		return true;
	}
	return std::find(_flightAirlines.begin(), _flightAirlines.end(), segment->getAirline()) != _flightAirlines.end();
}
