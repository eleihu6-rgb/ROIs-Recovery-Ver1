/**
 * @file CheckMaxNumberOfDPInRPForQQRuleParam.h
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
#include "CheckMaxNumberOfDPInRPForQQRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "Log/Logger.h"

using namespace std;


void CheckMaxNumberOfDPInRPForQQRuleParam::ParseParam(const DBRule& dbRule) {
	this->SetId(dbRule.idRule);
	this->SetRuleParamId(dbRule.idRuleParam);
	this->SetPhase(dbRule.phase);
	this->SetSource(dbRule.source);
	this->SetReference(dbRule.reference);
	this->SetOverrideAbility(dbRule.overridebility);
	this->SetDescription(dbRule.description);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	//Segment Assignments,Crew Ranks,Min Num
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
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
		else if (header == "DUTY ASSIGNMENT GROUPS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyAssignmentGroups);
			}
		}
		else if (header == "DUTY ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyAssignments);
			}
		}
		else if (header == "DP RANGES") {
			if (headeValue != RuleParamConstant::ALL) {
				_dpRanges = headeValue;
				if (!_dpRanges.empty()) {
					vector<string> splitstrs;
					split(_dpRanges.c_str(), '-', splitstrs);
					if (splitstrs.size() >= 2) {
						_dpMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
						_dpMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
					}
				}
				
			}
		}
		else if (header == "MAX LIMITATION") {
			if (headeValue != RuleParamConstant::ALL) {
				_maxLimitation = stoi(headeValue);
			}
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}

}

int CheckMaxNumberOfDPInRPForQQRuleParam::GetMatchDutyNumber(const vector<Duty*> duties, const time_t checkStart, const time_t checkEnd) const {
	int count = 0;
	for (const auto& duty : duties) {
		if (duty->getEndTimeLocAct() > checkEnd || duty->getEndTimeLocAct() < checkStart) {
			continue;
		}

		if (!MatchAssignment(duty->getAssignment()))
			continue;

		if (!MatchAssignmentGroup(duty->getAssignment()))
			continue;

		if (!MatchDutyPeriod(duty))
			continue;

		count++;
	}
	return count;
}

bool CheckMaxNumberOfDPInRPForQQRuleParam::MatchAssignmentGroup(const std::string& assignment) const {
	if (_dutyAssignmentGroups.empty() || _dutyAssignmentGroups[0] == "" || _dutyAssignmentGroups[0] == "*")
		return true;
	for (const auto& group : _dutyAssignmentGroups) {
		if (this->GetRule()->GetDataContext()->isAssignmentInGroup(assignment, group))
			return true;
	}
	return false;
}

bool CheckMaxNumberOfDPInRPForQQRuleParam::MatchAssignment(const std::string& assignment) const {
	if (_dutyAssignments.size() > 0 && _dutyAssignments[0] != "*" && find(_dutyAssignments.begin(), _dutyAssignments.end(), assignment) == _dutyAssignments.end())
		return false;
	return true;
}

bool CheckMaxNumberOfDPInRPForQQRuleParam::MatchDutyPeriod(const Duty* duty) const {
	if (_dpRanges.empty() || _dpRanges == "" || _dpRanges == "*") {
		return true;
	}

	const auto& dp = duty->getDPInSecs();
	return dp >= _dpMinutesLower * 60 && dp < _dpMinutesUpper * 60;
}


bool CheckMaxNumberOfDPInRPForQQRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}