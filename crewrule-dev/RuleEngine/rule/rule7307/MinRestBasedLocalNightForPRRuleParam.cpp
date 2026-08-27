/**
 * @file MinRestBasedLocalNightForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "MinRestBasedLocalNightForPRRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/CompositionRule.h"
#include "../constant/Constants.h"

#include "RuleParams.h"

using namespace std;

void MinRestBasedLocalNightForPRRuleParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::ASSIGNMENTS): {
				_assignments = substr;
				_assignmentMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::ASSIGNMENT_GROUPS): {
				_assignmentGroups = substr;
				_assignmentGroupsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::REPORTING_RANGE): {
				_reportingTimeRange = substr;

				vector<string> splitstrs;
				split(substr.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_reportingTimeRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_reportingTimeRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_REST_AT_BASE): {
				_minRestAtBase = substr;
				_minRestMinutesAtBase = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_REST_AT_LAYOVER): {
				_minRestAtLayover = substr;
				_minRestMinutesAtLayover = TimeUtils::hhmmToMinutes(substr);
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

void MinRestBasedLocalNightForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	//Bases,Assignment Groups,Assignments,Reporting Range,Min Rest at Base Without Local Night,Min Rest at Layover Without Local Night
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "BASES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _pairingBases);
			}
		}
		else if (header == "ASSIGNMENT GROUPS") {
			_assignmentGroups = headeValue;
			_assignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "ASSIGNMENTS") {
			_assignments = headeValue;
			_assignmentMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "REPORTING RANGE") {
			_reportingTimeRange = headeValue;

			vector<string> splitstrs;
			split(headeValue.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_reportingTimeRangeMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_reportingTimeRangeMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "MIN REST AT BASE WITHOUT LOCAL NIGHT") {
			_minRestAtBase = headeValue;
			_minRestMinutesAtBase = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "MIN REST AT LAYOVER WITHOUT LOCAL NIGHT") {
			_minRestAtLayover = headeValue;
			_minRestMinutesAtLayover = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//判断是否满足所在基地条件
bool MinRestBasedLocalNightForPRRuleParam::MatchHomeBase(const Duty& duty, const std::string& base) const {
	if (_pairingBases.empty()) {
		return true;
	}

	if (!base.empty()) {
		auto iter = std::find(_pairingBases.cbegin(), _pairingBases.cend(), base);
		return iter != _pairingBases.cend();
	}
	else {
		Pairing* pairing = this->GetRule()->GetDataContext()->pairingIdMap[duty.getPairingId()];
		if (pairing == nullptr) {
			spdlog::error("Pairing({}) do not exist.", duty.getPairingId());
			return true;
		}
		auto iter = std::find(_pairingBases.cbegin(), _pairingBases.cend(), pairing->getBase());
		return iter != _pairingBases.cend();
	}
}

bool MinRestBasedLocalNightForPRRuleParam::MatchHomeBase(const ROSTER* roster, const std::string& base) const {
	if (_pairingBases.empty()) {
		return true;
	}

	if (!base.empty()) {
		auto iter = std::find(_pairingBases.cbegin(), _pairingBases.cend(), base);
		return iter != _pairingBases.cend();
	}
	else {
		auto iter = std::find(_pairingBases.cbegin(), _pairingBases.cend(), roster->location);
		return iter != _pairingBases.cend();
	}
}

bool MinRestBasedLocalNightForPRRuleParam::MatchReportingTime(const Duty& duty) const {
	if (_reportingTimeRange.empty() || _reportingTimeRange == RuleParamConstant::ALL) {
		return true;
	}
	time_t checkinLoc = duty.getStartTimeLocAct();
	return TimeUtils::IsTimesInRange(checkinLoc, _reportingTimeRangeMinutesLower, _reportingTimeRangeMinutesUpper - 1);
}

bool MinRestBasedLocalNightForPRRuleParam::MatchParam(const Duty& duty, const std::string& base) const {

	if (!MatchHomeBase(duty, base)) {
		return false;
	}

	if (!_assignmentGroupsMatch.Match(duty)) {
		return false;
	}

	if (!_assignmentMatch.Match(duty)) {
		return false;
	}

	if (!MatchReportingTime(duty)) {
		return false;
	}

	return true;
}

bool MinRestBasedLocalNightForPRRuleParam::MatchParam(const ROSTER* roster, const std::string& base) const {

	if (!MatchHomeBase(roster, base)) {
		return false;
	}

	if (!_assignmentGroupsMatch.Match(*roster)) {
		return false;
	}

	if (!_assignmentMatch.Match(*roster)) {
		return false;
	}

	return true;
}