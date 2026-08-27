/**
 * @file CalculateGroundDPForTGRuleParam.h
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
#include "CalculateGroundDPForTGRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"

using namespace std;

void CalculateGroundDPForTGRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "ASSIGNMENT GROUPS") {
			_assignmentGroups = headeValue;
			_assignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignments);
			}
		}
		else if (header == "GROUND OFFSET") {
			if (headeValue != RuleParamConstant::ALL) {
				_offset = hhmmStrToMinutes(headeValue);
			}
		}
		else if (header == "RATE") {
			if (headeValue != RuleParamConstant::ALL) {
				_rate = atof(headeValue.c_str());
			}
		}
		else if (header == "GROUND LIMIT") {
			if (headeValue != RuleParamConstant::ALL) {
				_limit = hhmmStrToMinutes(headeValue);
			}
		}	
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

