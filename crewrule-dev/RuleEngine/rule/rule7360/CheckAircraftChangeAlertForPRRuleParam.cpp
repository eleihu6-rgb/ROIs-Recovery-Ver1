/**
 * @file CheckAircraftChangeAlertForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-02-10
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "CheckAircraftChangeAlertForPRRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void CheckAircraftChangeAlertForPRRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::CURRENT_ASSIGNMENTS): {
				_currSegmentAssignments = substr;
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					_currSegmentAssignmentMatch.SetExpression(substr, this->GetRule());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::NEXT_ASSIGNMENTS): {
				_nextSegmentAssignments = substr;
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					_nextSegmentAssignmentMatch.SetExpression(substr, this->GetRule());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CHECK_LEVEL): {
				_checkLevel = strToUpper(substr);
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

void CheckAircraftChangeAlertForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Current Assignments,Next Assignments,Check Level(D/P)
		if (header == "CURRENT ASSIGNMENTS") {
			_currSegmentAssignments = headeValue;
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				_currSegmentAssignmentMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "NEXT ASSIGNMENTS") {
			_nextSegmentAssignments = headeValue;
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				_nextSegmentAssignmentMatch.SetExpression(headeValue, this->GetRule());
			}
		}
		else if (header == "CHECK LEVEL(D/P)") {
			_checkLevel = strToUpper(headeValue);
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckAircraftChangeAlertForPRRuleParam::MatchParam(const Segment* currSegment, const Segment* nextSegment) const {

	if (!_currSegmentAssignmentMatch.Match(*currSegment)) {
		return false;
	}

	if (!_nextSegmentAssignmentMatch.Match(*nextSegment)) {
		return false;
	}

	return true;
}


