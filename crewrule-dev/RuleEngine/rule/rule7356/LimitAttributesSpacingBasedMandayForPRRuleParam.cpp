/**
 * @file LimitAttributesSpacingBasedMandayForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-11-14
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "spdlog/spdlog.h"
#include "LimitAttributesSpacingBasedMandayForPRRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "UtilFunc.h"


using namespace std;

void LimitAttributesSpacingBasedMandayForPRRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::BASES): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _bases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::RANKS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _ranks);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLEETS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _fleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::TEAMS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _teams);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ATTRIBUTES_A): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _attributesA);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::ATTRIBUTES_B): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _attributesB);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_PERIOD): {
				_minPeriod = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::UNIT): {
				_periodUnit = strToUpper(substr);
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

void LimitAttributesSpacingBasedMandayForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Attributes A,Attributes B,Min Period,Unit
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
		else if (header == "ATTRIBUTES A") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _attributesA);
			}
		}
		else if (header == "ATTRIBUTES B") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _attributesB);
			}
		}
		else if (header == "MIN PERIOD") {
			_minPeriod = atoi(headeValue.c_str());
		}
		else if (header == "UNIT") {
			_periodUnit = strToUpper(headeValue);
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool LimitAttributesSpacingBasedMandayForPRRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool LimitAttributesSpacingBasedMandayForPRRuleParam::MatchAttributesA(const std::shared_ptr<CREW_MANDAY_BASIC>& manday) const {
	if (this->_attributesA.empty()) {
		return true;
	}
	for (auto& attr : this->_attributesA) {
		if (manday->attributes.find(attr) != string::npos) {
			this->GetRule()->getRuleViolation().SetParam("attrA", attr);
			return true;
		}
	}
	return false;
}

bool LimitAttributesSpacingBasedMandayForPRRuleParam::MatchAttributesB(const std::shared_ptr<CREW_MANDAY_BASIC>& manday) const {
	if (this->_attributesB.empty()) {
		return true;
	}
	for (auto& attr : this->_attributesB) {
		if (manday->attributes.find(attr) != string::npos) {
			this->GetRule()->getRuleViolation().SetParam("attrB", attr);
			return true;
		}
	}
	return false;
}