/**
 * @file RedEyeDefinitionInDutyCycleForHXParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-14s
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "RedEyeDefinitionInDutyCycleForHXParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../framework/constant/Constants.h"

using namespace std;

void RedEyeDefinitionInDutyCycleForHXParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::IS_BEFORE_FDP): {
				_isBeforeFDP = (strToUpper(substr) == "Y");
				break;
			}
			case enum_to_underlying(ParamLocation::IS_AFTER_FDP): {
				_isAfterFDP = (strToUpper(substr) == "Y");
				break;
			}
			case enum_to_underlying(ParamLocation::EXCLUDE_ASSIGNMENTS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _excludeAssignments);
				}
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void RedEyeDefinitionInDutyCycleForHXParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Duty Period Within the LNP Before the FDP(Y/N),Duty Period Within the LNP After the FDP(Y/N),Exclude Assignments
		if (header == "DUTY PERIOD WITHIN THE LNP BEFORE THE FDP(Y/N)") {
			_isBeforeFDP = (strToUpper(headeValue) == "Y");
		}
		else if (header == "DUTY PERIOD WITHIN THE LNP AFTER THE FDP(Y/N)") {
			_isAfterFDP = (strToUpper(headeValue) == "Y");
		}
		else if (header == "EXCLUDE ASSIGNMENTS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _excludeAssignments);
			}
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}


