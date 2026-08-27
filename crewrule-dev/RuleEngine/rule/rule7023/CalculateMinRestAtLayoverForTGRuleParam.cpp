/**
 * @file CalculateMinRestAtLayoverForTGRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-07-25
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CalculateMinRestAtLayoverForTGRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../constant/Constants.h"
#include "TimezoneUtils.h"
#include "RuleParams.h"

using namespace std;

void CalculateMinRestAtLayoverForTGRuleParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::DUTY_ASSIGNMENTS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _dutyAssignments);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::TZ_DIFF): {
				_timezoneDiff = substr;

				vector<string> splitstrs;
				split(_timezoneDiff.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_timezoneDiffMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_timezoneDiffMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_REST):
				_minRestMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::SEVERITY):
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void CalculateMinRestAtLayoverForTGRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	//is Home Base(Y/N),Duty Assignments,TZ Diff,Min Rest
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//is Home Base(Y/N),Compositions,Duty Assignment Groups,Duty Type,Min Rest
		if (header == "IS HOME BASE(Y/N)") {
			_isHomeBase = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "DUTY ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyAssignments);
			}
		}
		else if (header == "TZ DIFF") {
			_timezoneDiff = headeValue;

			vector<string> splitstrs;
			split(_timezoneDiff.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_timezoneDiffMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_timezoneDiffMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "MIN REST") {
			_minRestMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//判断是否在基地
bool CalculateMinRestAtLayoverForTGRuleParam::MatchHomeBase(const Duty& duty, const std::string& base) const {
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
	//MinRest是否在基地，采用Duty的到达机场
	return _isHomeBase == nullptr || BaseUtils::IsHomeBaseByBase(duty.getArrStationRead(), vector<string>(), pairingBase) == *_isHomeBase;
}

bool CalculateMinRestAtLayoverForTGRuleParam::MatchDutyAssignments(const Duty& duty) const {
	if (_dutyAssignments.empty()) {
		return true;
	}
	string assignment = duty.getAssignment();
	auto iter = std::find(_dutyAssignments.cbegin(), _dutyAssignments.cend(), assignment);
	return iter != _dutyAssignments.cend();
}

bool CalculateMinRestAtLayoverForTGRuleParam::MatchDutyTzDiff(const Duty& duty) const {
	if (_timezoneDiff == RuleParamConstant::IGNORED) {
		return true;
	}
	int timeZoneDiff = TimezoneUtils::abs(DutyUtils::GetTimeZoneDiff(duty, this->GetRule()->GetDataContext()));
	return timeZoneDiff >= this->_timezoneDiffMinutesLower && timeZoneDiff <= this->_timezoneDiffMinutesUpper;
}

bool CalculateMinRestAtLayoverForTGRuleParam::MatchParam(const Duty& duty, const string& base) const {

	if (!MatchHomeBase(duty, base)) {
		return false;
	}

	if (!MatchDutyAssignments(duty)) {
		return false;
	}

	if (!MatchDutyTzDiff(duty)) {
		return false;
	}

	return true;
}

