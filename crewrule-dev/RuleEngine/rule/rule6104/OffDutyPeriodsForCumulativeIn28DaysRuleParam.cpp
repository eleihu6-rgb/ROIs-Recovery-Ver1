/**
 * @file OffDutyPeriodsForCumulativeIn28DaysRuleParam.h
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
#include "OffDutyPeriodsForCumulativeIn28DaysRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"

using namespace std;

void OffDutyPeriodsForCumulativeIn28DaysRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::BASES):
				split(substr, '|', _bases);
				break;
			case enum_to_underlying(ParamLocation::RANKS):
				split(substr, '|', _ranks);
				break;
			case enum_to_underlying(ParamLocation::FLEETS):
				split(substr, '|', _fleets);
				break;
			case enum_to_underlying(ParamLocation::TIME_PERIOD):
				_timePeriod = atoi(substr.c_str());
				break;
			case enum_to_underlying(ParamLocation::MIN_DAY_OFF):
				_minDayOff = atoi(substr.c_str());
				break;
			case enum_to_underlying(ParamLocation::TIME_PERIOD_UNIT):
				_timePeriodUnit = substr;
				break;
			case enum_to_underlying(ParamLocation::ASSIGNMENT_GROUPS):
				split(substr, '|', _assignmentGroups);
				break;
			case enum_to_underlying(ParamLocation::ASSIGNMENT_LEVEL):
				_assignmentLevel = substr;
				break;
			case enum_to_underlying(ParamLocation::CHECK_PERIOD_BY_START_OR_END):
				_checkPeriodStartOrEnd = substr;
				break;
			case enum_to_underlying(ParamLocation::DO_ASSIGNMENT_GROUPS):
				split(substr, '|', _dayOffAssignmentGroups);
				break;
			case enum_to_underlying(ParamLocation::UTILIZE_POST_DUTY_REST):
				_isUtilizePostDutyRest = (substr == "Y");
				break;
			case enum_to_underlying(ParamLocation::COUNT_BLANK_DAY):
				_isCountBlankDay = (substr == "Y");
				break;
			case enum_to_underlying(ParamLocation::ULTILIZE_LAYOVER):
				_isUltilizeLayover = (substr == "Y");
				break;
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void OffDutyPeriodsForCumulativeIn28DaysRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		
		if (header == "BASES") {
			split(headeValue, '|', _bases);
		}
		else if (header == "RANKS") {
			split(headeValue, '|', _ranks);
		}
		else if (header == "FLEETS") {
			split(headeValue, '|', _fleets);
		}
		else if (header == "TIME PERIOD") {
			_timePeriod = atoi(headeValue.c_str());
		}
		else if (header == "MIN DAY OFF") {
			_minDayOff = atoi(headeValue.c_str());
		}
		else if (header == "TIME PERIOD UNIT") {
			_timePeriodUnit = headeValue;
		}
		else if (header == "ASSIGNMENT GROUPS") {
			split(headeValue, '|', _assignmentGroups);
		}
		else if (header == "ASSIGNMENT LEVEL(P/D)") {
			_assignmentLevel = headeValue;
		}
		else if (header == "CHECK PERIOD BY START OR END(S/E)") {
			_checkPeriodStartOrEnd = headeValue;
		}
		else if (header == "DO ASSIGNMENT GROUPS") {
			split(headeValue, '|', _dayOffAssignmentGroups);
		}
		else if (header == "UTILIZE POST DUTY REST") {
			_isUtilizePostDutyRest = (headeValue == "Y");
		}
		else if (header == "COUNT BLANK DAY") {
			_isCountBlankDay = (headeValue == "Y");
		}
		else if (header == "ULTILIZE LAYOVER") {
			_isUltilizeLayover = (headeValue == "Y");
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool OffDutyPeriodsForCumulativeIn28DaysRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> teams;
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}






