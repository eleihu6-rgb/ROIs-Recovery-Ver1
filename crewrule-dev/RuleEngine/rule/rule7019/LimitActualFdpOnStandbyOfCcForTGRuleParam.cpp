/**
 * @file LimitActualFdpOnStandbyOfCcForTGRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <algorithm>
#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "LimitActualFdpOnStandbyOfCcForTGRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/BaseUtils.h"

using namespace std;

void LimitActualFdpOnStandbyOfCcForTGRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
				case enum_to_underlying(ParamLocation::IS_HOME_BASE): {
					_isHomeBase = (substr == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(substr == RuleParamConstant::YES);
					break;
				}
				case enum_to_underlying(ParamLocation::STANDBY_ASSIGNMENT_GROUPS): {
					_standbyAssignmentGroups = substr;
					_standbyAssignmentGroupsMatch.SetExpression(substr, this->GetRule());
					break;
				}
				case enum_to_underlying(ParamLocation::STANDBY_ASSIGNMENTS): {
					_standbyAssignments = substr;
					_standbyAssignmentsMatch.SetExpression(substr, this->GetRule());
					break;
				}
				case enum_to_underlying(ParamLocation::MAX_COMBINED_DURATION): {
					_maxCombinedDuration = substr;
					_maxCombinedDurationMinutes = TimeUtils::hhmmToMinutes(substr);
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

void LimitActualFdpOnStandbyOfCcForTGRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//is Home Base(Y/N),Standby Assignment Groups,Standby Assignments,Max Combined Duration
		if (header == "IS HOME BASE(Y/N)") {
			_isHomeBase = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "STANDBY ASSIGNMENT GROUPS") {
			_standbyAssignmentGroups = headeValue;
			_standbyAssignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "STANDBY ASSIGNMENTS") {
			_standbyAssignments = headeValue;
			_standbyAssignmentsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "MAX COMBINED DURATION") {
			_maxCombinedDuration = headeValue;
			_maxCombinedDurationMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}

}

//判断是否在基地
bool LimitActualFdpOnStandbyOfCcForTGRuleParam::MatchHomeBase(const Duty& duty, const std::string& base) const {
	std::string pairingBase;
	if (!base.empty()) {
		// if PO mode, extract the base string from pairing and passed to this predicate
		pairingBase = base;
	}
	else {
		// if editor mode, base is extracted from the segment's pairing
		Pairing* pairing = this->GetRule()->GetDataContext()->pairingIdMap[duty.getPairingId()];
		if (pairing == nullptr) {
			spdlog::error("Pairing({}) do not exist.", duty.getPairingId());
			return true;
		}
		pairingBase = pairing->getBase();
	}
	return _isHomeBase == nullptr || BaseUtils::IsHomeBaseByBase(duty.getDepStationRead(), vector<string>(), pairingBase) == *_isHomeBase;
}

bool LimitActualFdpOnStandbyOfCcForTGRuleParam::MatchParam(const ROSTER* standbyRoster, const Duty& duty, const string& base) const {

	if (!MatchHomeBase(duty, base)) {
		return false;
	}

	if (!_standbyAssignmentGroupsMatch.Match(*standbyRoster)) {
		return false;
	}

	if (!_standbyAssignmentsMatch.Match(*standbyRoster)) {
		return false;
	}

	return true;
}
