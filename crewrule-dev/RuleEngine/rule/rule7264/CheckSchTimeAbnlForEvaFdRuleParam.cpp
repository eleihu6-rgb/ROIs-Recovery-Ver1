/**
 * @file CheckSchTimeAbnlForEvaFdRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CheckSchTimeAbnlForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"

using namespace std;

void CheckSchTimeAbnlForEvaFdRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::DUTY_ASSIGNMENTS): {
				_dutyAssignments = substr;
				_dutyAssignmentsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::FLIGHT_FLEET_IN_DUTY): {
				_flightFleetInDuty = substr;
				_flightFleetInDutyMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::TIME_TYPE): {
				_timeType = substr;
				break;
			}
			case enum_to_underlying(ParamLocation::SEVERITY):
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void CheckSchTimeAbnlForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Duty Assignments,Flight Fleet in Duty,Time Type
		if (header == "DUTY ASSIGNMENTS") {
			_dutyAssignments = headeValue;
			_dutyAssignmentsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "FLIGHT FLEET IN DUTY") {
			_flightFleetInDuty = headeValue;
			_flightFleetInDutyMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "TIME TYPE") {
			_timeType = headeValue;
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckSchTimeAbnlForEvaFdRuleParam::MatchFlightFleetInDuty(const Duty& duty) const {
	bool matched = false;
	for (auto& segment : duty.getSegmentsRead()) {
		if (_flightFleetInDutyMatch.Match(segment->getFleetCD())) {
			matched = true;
			break;
		}
	}
	return matched;
}

//匹配规则参数是否满足
bool CheckSchTimeAbnlForEvaFdRuleParam::MatchParam(const Duty& duty) const {

	if (!_dutyAssignmentsMatch.Match(duty)) {
		return false;
	}

	if (!MatchFlightFleetInDuty(duty)) {
		return false;
	}

	return true;
}
