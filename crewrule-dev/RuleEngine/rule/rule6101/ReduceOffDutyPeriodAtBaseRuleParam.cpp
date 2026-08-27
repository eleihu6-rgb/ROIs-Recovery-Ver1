/**
 * @file ReduceOffDutyPeriodAtBaseRuleParam.cpp
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
#include "spdlog/spdlog.h"
#include "ReduceOffDutyPeriodAtBaseRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/BaseUtils.h"
#include "../utils/AssignmentUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"

using namespace std;

void ReduceOffDutyPeriodAtBaseRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::BASES):
				_strBases = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _bases);
				}
				break;
			case enum_to_underlying(ParamLocation::MIN_ODP_RANGES): {
				_minRestRanges = substr;

				vector<string> splitstrs;
				split(_minRestRanges.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_minRestMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_minRestMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_ODP_REDUCED_TO_MINIMUM):
				_reducedToMinRest = substr;
				_reducedToMinRestMinutes = TimeUtils::hhmmToMinutes(substr);
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

void ReduceOffDutyPeriodAtBaseRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Min ODP Ranges,Min ODP Reduced to Minimum
		if (header == "BASES") {
			_strBases = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _bases);
			}
		}
		else if (header == "MIN ODP RANGES") {
			_minRestRanges = headeValue;

			vector<string> splitstrs;
			split(_minRestRanges.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_minRestMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_minRestMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "MIN ODP REDUCED TO MINIMUM") {
			_reducedToMinRest = headeValue;
			_reducedToMinRestMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//判断是否满足所在基地条件
bool ReduceOffDutyPeriodAtBaseRuleParam::MatchHomeBase(const Duty& duty, const std::string& base) const {

	if (!base.empty()) {
		// if PO mode, extract the base string from pairing and passed to this predicate
		return BaseUtils::IsHomeBaseByBase(duty.getArrivalStation(), _bases, base);
	}

	// if editor mode, base is extracted from the segment's pairing
	Pairing *pairing = this->GetRule()->GetDataContext()->pairingIdMap[duty.getPairingId()];
	if (pairing == nullptr) {
		spdlog::error("Pairing({}) do not exist.", duty.getPairingId());
		return true;
	}
	return  BaseUtils::IsHomeBaseByBase(duty.getArrStationRead(), _bases, pairing->getBase());
}

bool ReduceOffDutyPeriodAtBaseRuleParam::MatchDutyAssignments(const Duty& duty) const {
	if (AssignmentUtils::IsFlyAssignment(duty.getAssignment(), this->GetRule()->GetDataContext())) {
		return true;
	}
	return false;
}

//匹配FlownSegments
bool ReduceOffDutyPeriodAtBaseRuleParam::MatchMinRestRanges(const Duty& duty) const {
	if (this->_minRestRanges == RuleParamConstant::ALL) {
		return true;
	}
	int minRestMinutes = duty.getMinRest();
	if (minRestMinutes >= this->_minRestMinutesLower && minRestMinutes < this->_minRestMinutesUpper) {
		return true;
	}
	return false;
}


//匹配规则参数是否满足
bool ReduceOffDutyPeriodAtBaseRuleParam::MatchParam(const Duty& duty, const std::string& base) const {

	if (!MatchHomeBase(duty, base)) {
		return false;
	}

	
	if (!MatchDutyAssignments(duty)) {
		return false;
	}

	if (!MatchMinRestRanges(duty)) {
		return false;
	}

	return true;
}

bool ReduceOffDutyPeriodAtBaseRuleParam::ValidReducedToMinRest() const {
	if (_reducedToMinRest.empty() || _reducedToMinRest == RuleParamConstant::IGNORED) {
		return false;
	}
	return true;
}