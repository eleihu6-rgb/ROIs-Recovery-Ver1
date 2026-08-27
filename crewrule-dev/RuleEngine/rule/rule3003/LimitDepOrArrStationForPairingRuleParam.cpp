/**
 * @file LimitDepOrArrStationForPairingRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-19
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "LimitDepOrArrStationForPairingRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/SegmentUtils.h"
#include "../constant/Constants.h"

using namespace std;

void LimitDepOrArrStationForPairingRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::PAIRING_ASSIGNMENTS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _pairingAssignments);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::BASES): {
				_bases = substr;
                _basesMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::SEVERITY): {
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void LimitDepOrArrStationForPairingRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Pairing Assignments,Bases
		if (header == "PAIRING ASSIGNMENTS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _pairingAssignments);
			}
		}
		else if (header == "BASES") {
			_bases = headeValue;
			_basesMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//匹配规则参数是否满足
bool LimitDepOrArrStationForPairingRuleParam::MatchParam(const Pairing* pairing) const {
	if (!MatchPairingAssignments(pairing)) {
		return false;
	}

	return true;
}

bool LimitDepOrArrStationForPairingRuleParam::CheckParam(const Pairing* pairing) const {
	if (!_basesMatch.Match(pairing->getFirstDuty()->getDepStationRead())) {
		return false;
	}

	if (!_basesMatch.Match(pairing->getLastDuty()->getArrStationRead())) {
		return false;
	}
    return true;
}

bool LimitDepOrArrStationForPairingRuleParam::MatchPairingAssignments(const Pairing* pairing) const {
	if (_pairingAssignments.empty()) {
		return true;
	}
	return std::find(_pairingAssignments.begin(), _pairingAssignments.end(), pairing->getQualifier()) != _pairingAssignments.end();
}