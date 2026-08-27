/**
 * @file MaxFDPByCalloutStandbyForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-19
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "UtilFunc.h"
#include "spdlog/spdlog.h"
#include "MaxFDPByCalloutStandbyForPRRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../constant/Constants.h"
#include "../utils/SegmentUtils.h"
#include "../utils/BaseUtils.h"

using namespace std;

inline static bool IsSplitDuty(const Duty& duty) {
	//Duty包含pseudo rest则认为是SplitDuty（即：Duty的PairingDutyNodes包含类型为SEGMENT的节点）
	for(auto& node : duty.pairingDutyNodes) {
		if (node->getType() == "SEGMENT") {
			return true;
		}
	}
	return false;
}

inline static bool IsInFlightRest(const Duty& duty) {
	//针对5J: Duty的Attributes包含AUG或DBL即认为是InflightRest
	vector<string> attributes;
	split(duty.getAttributes(), '|', attributes);
	if (find(attributes.begin(), attributes.end(), "AUG") != attributes.end() 
		|| find(attributes.begin(), attributes.end(), "DBL") != attributes.end()) {
		return true;
	}

	//针对TG, Duty的Max FDP被扩展即认为是InflightRest
	if (duty.getFdpExtensionMinutes() > 0) {
		return true;
	}
	
	return false;
}

void MaxFDPByCalloutStandbyForPRRuleParam::ParseParam(const std::string &paramString) {
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
			case enum_to_underlying(ParamLocation::STANDBY_START_RANGE): {
				_standbyStartRange = substr;
				if (substr != RuleParamConstant::ALL) {
					vector<string> splitstrs;
					split(substr.c_str(), '-', splitstrs);
					if (splitstrs.size() >= 2) {
						_standbyStartRangeLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
						_standbyStartRangeUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
					}
				}
				break;
			}
			case enum_to_underlying(ParamLocation::STANDBY_OVERLAP_RANGE): {
				_standbyOverlapRange = substr;
				if (substr != RuleParamConstant::ALL) {
					vector<string> splitstrs;
					split(substr.c_str(), '-', splitstrs);
					if (splitstrs.size() >= 2) {
						_standbyOverlapRangeLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
						_standbyOverlapRangeUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
					}
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CALLOUT_FDP_TYPE): {
				_calloutFDPType = strToUpper(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::THRESHOLD): {
				_thresholdHHmm = substr;
				_thresholdHHmmMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::ADJUSTMENT_PCT): {
				_strAdjustmentPCT = substr;
				_adjustmentPCT = atoi(substr.c_str());
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

void MaxFDPByCalloutStandbyForPRRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Bases,Ranks,Fleets,Teams,Standby Assignment Groups,Standby Assignments,Standby Start Range,Standby Overlap Range,Callout FDP Type,Threshold,Adjustment PCT
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
		else if (header == "STANDBY ASSIGNMENT GROUPS") {
			_standbyAssignmentGroups = headeValue;
			_standbyAssignmentGroupsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "STANDBY ASSIGNMENTS") {
			_standbyAssignments = headeValue;
			_standbyAssignmentsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "STANDBY START RANGE" || header == "STANDBY START RANGES") {
			_standbyStartRange = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				vector<string> splitstrs;
				split(headeValue.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_standbyStartRangeLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_standbyStartRangeUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
			}
		}
		else if (header == "STANDBY OVERLAP RANGE" || header == "STANDBY OVERLAP RANGES") {
			_standbyOverlapRange = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				vector<string> splitstrs;
				split(headeValue.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_standbyOverlapRangeLower = TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
					_standbyOverlapRangeUpper = TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
				}
			}
		}
		else if (header == "CALLOUT FDP TYPE") {
			_calloutFDPType = strToUpper(headeValue);
		}
		else if (header == "THRESHOLD") {
			_thresholdHHmm = headeValue;
			_thresholdHHmmMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "ADJUSTMENT PCT") {
			_strAdjustmentPCT = headeValue;
			_adjustmentPCT = atoi(headeValue.c_str());
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool MaxFDPByCalloutStandbyForPRRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

//匹配规则参数是否满足
bool MaxFDPByCalloutStandbyForPRRuleParam::MatchParam(const ROSTER* standbyRoster, const ROSTER* flyRoster, const Duty& duty) const {
	
	if (!_standbyAssignmentGroupsMatch.Match(*standbyRoster)) {
		return false;
	}

	if (!_standbyAssignmentsMatch.Match(*standbyRoster)) {
		return false;
	}

	if (!MatchCalloutFDPType(duty)) {
		return false;
	}

	if (flyRoster->callinSBY_FDPMins < this->_thresholdHHmmMinutes) {
		return false;
	}
	return true;
}

bool MaxFDPByCalloutStandbyForPRRuleParam::MatchStandbyStartTimeRange(const ROSTER* standbyRoster) const {
	if (_standbyStartRange.empty() || _standbyStartRange == RuleParamConstant::ALL) {
		return true;
	}

	if (standbyRoster == nullptr) {
		return true;
	}
	return TimeUtils::IsTimesInRange(standbyRoster->actStrLoc,  _standbyStartRangeLower, _standbyStartRangeUpper);
}

bool MaxFDPByCalloutStandbyForPRRuleParam::MatchCalloutFDPType(const Duty& duty) const {
	if (_calloutFDPType.empty() || _calloutFDPType == RuleParamConstant::ALL) {
		return true;
	}

	if (_calloutFDPType == "SPLITDUTY") {
		return IsSplitDuty(duty);
	}
	else if (_calloutFDPType == "INFLIGHTREST") {
		return IsInFlightRest(duty);
	}
	return false;
}

int MaxFDPByCalloutStandbyForPRRuleParam::CalculateStandbyDeduction(const ROSTER* standbyRoster, const ROSTER* flyRoster) const {
	if (standbyRoster == nullptr) {
		return 0;
	}
	auto& dbData = this->GetRule()->GetDataContext();
	int overlapMinutes = 0;
	if (MatchStandbyStartTimeRange(standbyRoster)) {
		if (!_standbyOverlapRange.empty() && _standbyOverlapRange != RuleParamConstant::ALL) {
			overlapMinutes = TimeUtils::GetOverlapDuration(standbyRoster->actStrLoc, flyRoster->actStrLoc,
				_standbyOverlapRangeLower, _standbyOverlapRangeUpper, 0);//抓回时间段与Standby Overlap Range重叠的时长
		}
	}

	time_t firstDutyCheckinTime = flyRoster->pairing->getFirstDuty()->getFirstBreif()->getStartTimeUtcAct();
	int standbyDuration = (int)(firstDutyCheckinTime - standbyRoster->actStrUtc) / 60;//抓回时长
	if (dbData->scenario.airline == "5J") {
		standbyDuration -= 1; //5J航空的抓回时长需扣除1分钟
	}
	
	int deduction = (standbyDuration - overlapMinutes - _thresholdHHmmMinutes) * (_adjustmentPCT / 100.0);
	return max(deduction, 0);
}
