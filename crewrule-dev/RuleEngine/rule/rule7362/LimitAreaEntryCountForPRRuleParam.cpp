/**
 * @file LimitAreaEntryCountForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-03-11
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "LimitAreaEntryCountForPRRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void LimitAreaEntryCountForPRRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::PAIRING_BASES): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _pairingBases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::AIRPORT_AREA): {
				_strAirportAreas = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _airportAreas);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CHECK_MODE): {
				_checkMode = strToUpper(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::ENTRY_TIMES): {
				_entryTimes = atoi(substr.c_str());
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

void LimitAreaEntryCountForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Pairing Bases,Airport Area,Check Mode,Entry Times
		if (header == "PAIRING BASES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _pairingBases);
			}
		}
		else if (header == "AIRPORT AREA") {
			_strAirportAreas = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _airportAreas);
			}
		}
		else if (header == "CHECK MODE") {
			_checkMode = strToUpper(headeValue.c_str());
		}
		else if (header == "ENTRY TIMES") {
			_entryTimes = atoi(headeValue.c_str());
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//判断是否满足所在基地条件
bool LimitAreaEntryCountForPRRuleParam::MatchPairingHomeBase(const std::string& base) const {
	if (_pairingBases.empty()) {
		return true;
	}

	if (!base.empty()) {
		// if PO mode, extract the base string from pairing and passed to this predicate
		auto iter = std::find(_pairingBases.cbegin(), _pairingBases.cend(), base);
		return iter != _pairingBases.cend();
	}
	return false;
}




