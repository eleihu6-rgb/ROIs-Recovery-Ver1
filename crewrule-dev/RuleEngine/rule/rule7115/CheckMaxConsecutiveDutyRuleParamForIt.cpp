/**
 * @file CheckMaxConsecutiveDutyRuleParamForIt.h
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
#include "CheckMaxConsecutiveDutyRuleParamForIt.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"

using namespace std;

void CheckMaxConsecutiveDutyRuleParamForIt::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Assignments,Compositions,Period,Unit,Max BLH
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
		else if (header == "DUTY ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyAssignments);
			}
		}
		else if (header == "CONSECUTIVE DAYS") {
			if (headeValue != RuleParamConstant::ALL) {
				_consecutiveDays = atoi(headeValue.c_str());
			}
		}
		else if (header == "NEXT DAY EXTENSION") {
			_nextDayExtension = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "NOT ALLOWED ATTRIBUTES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _notAllowedAttributes);
			}
		}
		else if (header == "NOT ALLOWED ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _notAllowedAssignments);
			}
		}
		else if (header == "NOT ALLOWED DAYS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _notAllowedDays);
			}
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckMaxConsecutiveDutyRuleParamForIt::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> teams;
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool CheckMaxConsecutiveDutyRuleParamForIt::MatchAssignments(const Duty& duty, const std::shared_ptr<CrewDataContext>& dbData) const {
	if (_dutyAssignments.empty()) {
		return true;
	}
	string assignment = duty.getAssignment();
	auto iter = std::find(_dutyAssignments.cbegin(), _dutyAssignments.cend(), assignment);
	return iter != _dutyAssignments.cend();
}
