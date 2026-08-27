/**
 * @file CheckMaxEarlyStartOrLateFinishWithinPeriodRuleParam.h
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
#include "CheckMaxEarlyStartOrLateFinishWithinPeriodRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"

using namespace std;

void CheckMaxEarlyStartOrLateFinishWithinPeriodRuleParam::ParseParam(const DBRule& dbRule) {
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
		else if (header == "ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignments);
			}
		}
		else if (header == "PERIOD") {
			_period = atoi(headeValue.c_str());
		}
		else if (header == "UNIT") {
			_unit = headeValue;
		}
		else if (header == "MAX LIMITS") {
			_maxLimits = atoi(headeValue.c_str());
		}
		else if (header == "MIN LIMITS") {
			_minLimits = atoi(headeValue.c_str());
		}
		else if (header == "CHECK TYPE") {
			_checkType = headeValue;
		}
		else if (header == "CHECK MODE") {
			_checkMode = headeValue;
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckMaxEarlyStartOrLateFinishWithinPeriodRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}


bool CheckMaxEarlyStartOrLateFinishWithinPeriodRuleParam::MatchParam(const ROSTER& roster) const {
	return true;
}

//检查是否满足参数
int CheckMaxEarlyStartOrLateFinishWithinPeriodRuleParam::CheckParam(const ROSTER& roster) const {
	int warnCode = (int)WarnCode::NO_WARN;

	return warnCode;
}

bool CheckMaxEarlyStartOrLateFinishWithinPeriodRuleParam::MatchAssignmentParam(const string& assignment) const {
	if (_assignments.empty() || _assignments[0] == "*" || _assignments[0] == "")
		return true;

	return find(_assignments.begin(), _assignments.end(), assignment) != _assignments.end();
}
