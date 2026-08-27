/**
 * @file LimitSwingbackForSQRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-16
**/


#include <algorithm>
#include <map>
#include <sstream>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "LimitSwingbackForSQRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../constant/Constants.h"
#include "TimezoneUtils.h"

using namespace std;

namespace {
bool isAllTokenUpper(const std::string& trimmedUpper) {
	return trimmedUpper.empty() || trimmedUpper == "*" || trimmedUpper == RuleParamConstant::ALL ||
		trimmedUpper == RuleParamConstant::IGNORED || trimmedUpper == RuleParamConstant::IGNORED_2;
}

std::vector<std::string> splitPipeUpper(const std::string& raw) {
	std::vector<std::string> out;
	std::vector<std::string> tmp;
	split(trim(raw).c_str(), '|', tmp);
	out.reserve(tmp.size());
	for (const auto& t : tmp) {
		const std::string u = strToUpper(trim(t));
		if (!u.empty()) {
			out.push_back(u);
		}
	}
	return out;
}

std::string deriveDutyServiceTypeUpper(const Duty& duty) {
	bool sawOperating = false;
	bool allOperatingAreFreighter = true;
	for (auto* seg : duty.getSegmentsRead()) {
		if (seg == nullptr || !seg->getIsOperating()) {
			continue;
		}
		sawOperating = true;
		if (seg->getServiceType() != "F") {
			allOperatingAreFreighter = false;
			break;
		}
	}
	return (sawOperating && allOperatingAreFreighter) ? "F" : "J";
}

bool dutyMatchesFleetGroups(const Duty& duty,
							const std::vector<std::string>& allowedFleetGroupsUpper,
							const CrewDataContext* dbData) {
	if (allowedFleetGroupsUpper.empty()) {
		return true;
	}
	if (dbData == nullptr) {
		return false;
	}

	bool foundOperatingSegment = false;
	for (auto* seg : duty.getSegmentsRead()) {
		if (seg == nullptr || !seg->getIsOperating()) {
			continue;
		}
		foundOperatingSegment = true;

		const std::string fleet = seg->getFleetCD();
		if (fleet.empty()) {
			return false;
		}
		const auto it = dbData->fleetMap.find(fleet);
		if (it == dbData->fleetMap.end()) {
			return false;
		}
		const std::string fleetGroupUpper = it->second.fleetGrp;
		if (fleetGroupUpper.empty() ||
			std::find(allowedFleetGroupsUpper.begin(), allowedFleetGroupsUpper.end(), fleetGroupUpper) == allowedFleetGroupsUpper.end()) {
			return false;
		}
	}
	return foundOperatingSegment;
}
}  // namespace

void LimitSwingbackForSQRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::SERVICE_TYPE): {
				const std::string valueUpper = strToUpper(trim(substr));
				_serviceTypeUpper = valueUpper.empty() ? "*" : valueUpper;
				break;
			}
			case enum_to_underlying(ParamLocation::FLEET_GROUP): {
				const std::string valueUpper = strToUpper(trim(substr));
				if (isAllTokenUpper(valueUpper)) {
					_fleetGroupsUpper.clear();
				} else {
					_fleetGroupsUpper = splitPipeUpper(valueUpper);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::SWINGBACK_TZ_DIFF): {
				_swingbackTZDiff = substr;

				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					vector<string> splitstrs;
					split(_swingbackTZDiff.c_str(), '-', splitstrs);
					if (splitstrs.size() >= 2) {
						_swingbackTZDiffMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
						_swingbackTZDiffMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
					}
				}
				break;
			}
			case enum_to_underlying(ParamLocation::SAME_TZ_TOLERANCE): {
				_sameTZTolerance = substr;

				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					_sameTZToleranceMinutes = TimeUtils::hhmmToMinutes(substr);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::MAX_SWINGBACK): {
				_maxSwingbackCount = atoi(substr.c_str());
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

void LimitSwingbackForSQRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		const std::string headerUpper = strToUpper(trim(header));
		//Service Type,Fleet Group,Swingback TZ Diff,Same TZ Tolerance,Max Swingback
		if (headerUpper == "SERVICE TYPE") {
			const std::string valueUpper = strToUpper(trim(headeValue));
			_serviceTypeUpper = valueUpper.empty() ? "*" : valueUpper;
		}
		else if (headerUpper == "FLEET GROUP" || headerUpper == "FLEET GROUPS" || headerUpper == "FLEET GROUP(GRP)" ||
				 headerUpper == "FLEET GRP" || headerUpper == "FLEETGRP") {
			const std::string valueUpper = strToUpper(trim(headeValue));
			if (isAllTokenUpper(valueUpper)) {
				_fleetGroupsUpper.clear();
			} else {
				_fleetGroupsUpper = splitPipeUpper(valueUpper);
			}
		}
		else if (headerUpper == "SWINGBACK TZ DIFF" || headerUpper == "SWINGBACK TZ DIFF") {
			_swingbackTZDiff = headeValue;

			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				vector<string> splitstrs;
				split(_swingbackTZDiff.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_swingbackTZDiffMinutesLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_swingbackTZDiffMinutesUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
			}
		}
		else if (headerUpper == "SAME TZ TOLERANCE" || headerUpper == "SAME TZ TOLERANCE") {
			_sameTZTolerance = headeValue;

			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				_sameTZToleranceMinutes = TimeUtils::hhmmToMinutes(headeValue);
			}
		}
		else if (headerUpper == "MAX SWINGBACK" || headerUpper == "MAX SWINGBACK") {
			_maxSwingbackCount = atoi(headeValue.c_str());
		}
		else if (headerUpper == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

//匹配规则参数是否满足
bool LimitSwingbackForSQRuleParam::MatchParam(const Duty* duty1, const Duty* duty2, const Duty* duty3) const {
	if (duty2 == nullptr) {
		return false;
	}
	const std::string serviceFilterUpper = _serviceTypeUpper;
	if (!isAllTokenUpper(serviceFilterUpper)) {
		if (deriveDutyServiceTypeUpper(*duty2) != serviceFilterUpper) {
			return false;
		}
	}
	if (!dutyMatchesFleetGroups(*duty2, _fleetGroupsUpper, this->GetRule()->GetDataContext().get())) {
		return false;
	}

	if (!MatchSwingbackTZDiff(duty1, duty2, duty3)) {
		return false;
	}

	if (!MatchTZTolerance(duty1, duty3)) {
		return false;
	}

	return true;
}

//匹配abs (tz2 - tz1) >= 3 
bool LimitSwingbackForSQRuleParam::MatchSwingbackTZDiff(const Duty* duty1, const Duty* duty2, const Duty* duty3) const {
	if (!MatchSwingbackTZDiff(duty1, duty2)) {
		return false;
	}

	if (!MatchSwingbackTZDiff(duty2, duty3)) {
		return false;
	}

	return true;
}

bool LimitSwingbackForSQRuleParam::MatchSwingbackTZDiff(const Duty* prevDuty, const Duty* currDuty) const {
	int timeZoneDiff = TimezoneUtils::abs(DutyUtils::GetTimeZoneDiffByArr(*prevDuty, *currDuty, this->GetRule()->GetDataContext()));
	return timeZoneDiff >= this->_swingbackTZDiffMinutesLower && timeZoneDiff <= this->_swingbackTZDiffMinutesUpper;
}

//匹配abs(tz1 - tz3)<tolerance
bool LimitSwingbackForSQRuleParam::MatchTZTolerance(const Duty* duty1, const Duty* duty3) const {
	auto& dbData = this->GetRule()->GetDataContext();
	string duty1ArrZoneId = dbData->getAirportZoneId(duty1->getArrStationRead());
	string duty3ArrZoneId = dbData->getAirportZoneId(duty3->getArrStationRead());
	int timeZoneDiff = TimezoneUtils::GetTimezoneOffset(duty1->getEndTimeUtcAct(), duty1ArrZoneId, duty3->getEndTimeUtcAct(), duty3ArrZoneId);
	timeZoneDiff = TimezoneUtils::abs(timeZoneDiff);
	return timeZoneDiff <= _sameTZToleranceMinutes;
}
