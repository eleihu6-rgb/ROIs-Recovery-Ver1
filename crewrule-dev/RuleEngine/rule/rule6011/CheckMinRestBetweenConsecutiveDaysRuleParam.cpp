/**
 * @file CheckMinRestBetweenConsecutiveDaysRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <algorithm>
#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CheckMinRestBetweenConsecutiveDaysRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"

using namespace std;


void CheckMinRestBetweenConsecutiveDaysRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
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
		else if (header == "CONSECUTIVE DAYS BEFORE REST") {
			if (headeValue != RuleParamConstant::ALL) {
				_consecutiveDaysBeforeRest = atoi(headeValue.c_str());
			}
		}
		else if (header == "CONSECUTIVE DAYS AFTER REST") {
			if (headeValue != RuleParamConstant::ALL) {
				_consecutiveDaysAfterRest = atoi(headeValue.c_str());
			}
		}
		else if (header == "ASSIGNMENTS BEFORE REST") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignmentsAfterRest);
				_assignmentsBeforeMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "ASSIGNMENTS AFTER REST") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignmentsAfterRest);
				_assignmentsAfterMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "ASSIGNMENT GROUPS BEFORE REST") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignmentGroupsBeforeRest);
				_assignmentGroupsBeforeMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "ASSIGNMENT GROUPS AFTER REST") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignmentGroupsAfterRest);
				_assignmentGroupsAfterMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "MIN REST DAYS") {
			_minRestDays = atoi(headeValue.c_str());
		}
		else if (header == "REST ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _restAssignments);
				_assignmentsRestMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "REST ASSIGNMENT GROUPS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _restAssignmentGroups);
				_assignmentGroupsRestMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "BLANK DAYS COUNT") {
			if (headeValue != RuleParamConstant::ALL) {
				_blankDaysCount = headeValue;
			}
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}

}

bool CheckMinRestBetweenConsecutiveDaysRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool CheckMinRestBetweenConsecutiveDaysRuleParam::MatchBeforeParam(const ROSTER* roster) const {
	if (!_assignmentsBeforeMatch.Match(*roster) || !_assignmentGroupsBeforeMatch.Match(*roster)) {
		return false;
	}
	return true;
}

bool CheckMinRestBetweenConsecutiveDaysRuleParam::MatchAfterParam(const ROSTER* roster) const {
	if (!_assignmentsAfterMatch.Match(*roster) || !_assignmentGroupsAfterMatch.Match(*roster)) {
		return false;
	}
	return true;
}

bool CheckMinRestBetweenConsecutiveDaysRuleParam::MatchRestParam(const ROSTER* roster) const {
	if (!_assignmentsRestMatch.Match(*roster) || !_assignmentGroupsRestMatch.Match(*roster)) {
		return false;
	}
	return true;
}