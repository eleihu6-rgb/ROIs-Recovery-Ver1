/**
 * @file CheckMaxFlightsInPeriodForPRRuleParam.h
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
#include "CheckMaxFlightsInPeriodForPRRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"


using namespace std;

void CheckMaxFlightsInPeriodForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "FLIGHT ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _flightAssignments);
			}
		}
		else if (header == "PERIOD") {
			if (headeValue != RuleParamConstant::ALL) {
				_period = stoi(headeValue);
			}
		}
		else if (header == "UNIT") {
			if (headeValue != RuleParamConstant::ALL) {
				_unit = headeValue;
			}
		}
		else if (header == "TYPE") {
			if (headeValue != RuleParamConstant::ALL) {
				_type = headeValue;
			}
		}
		else if (header == "MAX FLIGHTS") {
			if (headeValue != RuleParamConstant::ALL) {
				_maxFlights = stoi(headeValue);
			}
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckMaxFlightsInPeriodForPRRuleParam::MatchAssignment(const string& assignment) const {
	if (_flightAssignments.empty() || _flightAssignments[0] == "*" || _flightAssignments[0] == "")
		return true;

	return find(_flightAssignments.begin(), _flightAssignments.end(), assignment) != _flightAssignments.end();
}