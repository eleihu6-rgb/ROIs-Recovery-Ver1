/**
 * @file LimitBeforeAnnualLeaveRuleParam.h
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
#include "LimitBeforeAnnualLeaveRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"

using namespace std;

void LimitBeforeAnnualLeaveRuleParam::ParseParam(const std::string &paramString) {
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
				case enum_to_underlying(ParamLocation::ASSIGNMENTS):
					if (substr != RuleParamConstant::ALL) {
						split(substr, '|', _assignments);
					}
					break;
				case enum_to_underlying(ParamLocation::MIN_PERIOD_DAYS):
					_minPeriodDays = atoi(substr.c_str());
					break;
				case enum_to_underlying(ParamLocation::CHECK_OUT_REFERENCE_TIME):
					_checkOutReferenceTime = substr;
					_checkOutReferenceTimeMinutes = TimeUtils::hhmmToMinutes(substr);
					break;
				case enum_to_underlying(ParamLocation::CHECK_IN_REFERENCE_TIME):
					_checkInReferenceTime = substr;
					_checkInReferenceTimeMinutes = TimeUtils::hhmmToMinutes(substr);
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

void LimitBeforeAnnualLeaveRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
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
		else if (header == "ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _assignments);
			}
		}
		else if (header == "MIN PERIOD DAYS") {
			_minPeriodDays = atoi(headeValue.c_str());
		}
		else if (header == "CHECK OUT REFERENCE TIME") {
			_checkOutReferenceTime = headeValue;
			_checkOutReferenceTimeMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "CHECK IN REFERENCE TIME") {
			_checkInReferenceTime = headeValue;
			_checkInReferenceTimeMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}

}

bool LimitBeforeAnnualLeaveRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool LimitBeforeAnnualLeaveRuleParam::MatchAssignment(const std::string& assignment) const {
	if (_assignments.empty()) {
		return true;
	}
	auto iter = std::find(_assignments.cbegin(), _assignments.cend(), assignment);
	return iter != _assignments.cend();
}

bool LimitBeforeAnnualLeaveRuleParam::MatchMinPeriodDays(const int annualLeaveDays) const {
	return annualLeaveDays >= (int)_minPeriodDays;
}

bool LimitBeforeAnnualLeaveRuleParam::MatchCheckInReferenceTime(const time_t breifStartTimeLoc, const time_t beforeRosterEnd) const {
	const auto& space = breifStartTimeLoc - beforeRosterEnd;
	const auto& minSpace = _checkInReferenceTimeMinutes * 60;
	return space >= minSpace;
}

bool LimitBeforeAnnualLeaveRuleParam::MatchCheckOutReferenceTime(const time_t debreifEndTimeLoc, const time_t afterRosterStart) const {
	const auto& space = afterRosterStart - debreifEndTimeLoc;
	const auto& minSpace = (24 * 60 - _checkOutReferenceTimeMinutes) * 60;
	
	return space >= minSpace;
}

//bool LimitBeforeAnnualLeaveRuleParam::MatchParam(const std::string& composition, const long &reportTime, bool isAugment) const {
//
//    // The checking sequence can be reordered to better speed up the process
//    if (isAugment != _isAugment) return false;
//
//    if (_composition.front() != InputRuleParamDefine::WildcardChar && composition != _composition) return false;
//
//    if (reportTime < _reportTimeLower || reportTime > _reportTimeUpper) return false;
//
//    return true;
//}


