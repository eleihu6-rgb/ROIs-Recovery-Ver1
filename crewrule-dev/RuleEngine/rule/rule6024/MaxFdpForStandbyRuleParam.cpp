/**
 * @file MaxFdpForStandbyRuleParam.h
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
#include "MaxFdpForStandbyRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"
#include "../utils/CompositionRule.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"


using namespace std;

void MaxFdpForStandbyRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::IS_HOME_BASE):
				_isHomeBase = (substr == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(substr == RuleParamConstant::YES);
				break;
			case enum_to_underlying(ParamLocation::COMPOSITIONS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _compositions);
				}
				break;
			case enum_to_underlying(ParamLocation::STANDBY_ASSIGNMENT_GROUPS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _standbyAssignmentGroups);
				}
				break;
			case enum_to_underlying(ParamLocation::STANDBY_ASSIGNMENTS):
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _standbyAssignments);
				}
				break;
			case enum_to_underlying(ParamLocation::ACC_STATE):
				_acclimatizationState = substr;
				break;
			case enum_to_underlying(ParamLocation::INCLUDING_SPLIT_DUTY):
				 _isIncludingSplitDuty = (substr == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(substr == RuleParamConstant::YES);
				break;
			case enum_to_underlying(ParamLocation::MIN_SPLIT_REST):
				_minSplitRest = substr;
				_minSplitRestMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::REST_FACILITY):
				_restFacility = substr.empty() ? RuleParamConstant::ALL : substr;
				break;
			case enum_to_underlying(ParamLocation::WOCL_WINDOW):
				{
					_woclWindow = substr.empty() ? RuleParamConstant::ALL : substr;

					vector<string> splitstrs;
					split(_woclWindow.c_str(), '-', splitstrs);
					if (splitstrs.size() >= 2) {
						_woclWindowHHmmLower = splitstrs[0].c_str(); // TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
						_woclWindowHHmmUpper = splitstrs[1].c_str(); // TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
					}
				}
				break;
			case enum_to_underlying(ParamLocation::EARLY_START_WINDOW):
				{
					_esWindow = substr.empty() ? RuleParamConstant::ALL : substr;

					vector<string> splitstrs;
					split(_esWindow.c_str(), '-', splitstrs);
					if (splitstrs.size() >= 2) {
						_esWindowHHmmLower = splitstrs[0].c_str(); // TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
						_esWindowHHmmUpper = splitstrs[1].c_str(); // TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
					}
				}
				break;
			case enum_to_underlying(ParamLocation::MAX_CALL_OUT_FDP):
				_strMaxFDP = substr;
				_maxFDPMinutes = TimeUtils::hhmmToMinutes(substr);
				break;
			case enum_to_underlying(ParamLocation::EXTEND_MAX_FDP_BY_STANDBY):
				_isExtendMaxFDPByStandby = (substr == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(substr == RuleParamConstant::YES);
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

void MaxFdpForStandbyRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//is Home Base,Compositions,Standby Assignments,ACC State,Including Split Duty(Y/N),Min Split Rest,Rest Facility,Time Windows,Time Type(WOCL/ES),Max Call out FDP,Extend Max FDP by Standby(Y/N)
		if (header == "IS HOME BASE") {
			_isHomeBase = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "COMPOSITIONS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _compositions);
			}
		}
		else if (header == "STANDBY ASSIGNMENT GROUPS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _standbyAssignmentGroups);
			}
		}
		else if (header == "STANDBY ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _standbyAssignments);
			}
		}
		else if (header == "ACC STATE") {
			_acclimatizationState = headeValue;
		}
		else if (header == "INCLUDING SPLIT DUTY(Y/N)") {
			_isIncludingSplitDuty = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "MIN SPLIT REST") {
			_minSplitRest = headeValue;
			_minSplitRestMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "REST FACILITY") {
			_restFacility = headeValue.empty() ? RuleParamConstant::ALL : headeValue;
		}
		else if (header == "NOT IN WOCL") {
			_woclWindow = headeValue.empty() ? RuleParamConstant::ALL : headeValue;

			vector<string> splitstrs;
			split(_woclWindow.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_woclWindowHHmmLower = splitstrs[0].c_str(); // TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_woclWindowHHmmUpper = splitstrs[1].c_str(); // TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "NOT IN EARLY START") {
			_esWindow = headeValue.empty() ? RuleParamConstant::ALL : headeValue;

			vector<string> splitstrs;
			split(_esWindow.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_esWindowHHmmLower = splitstrs[0].c_str(); // TimeUtils::hhmmToMinutes(splitstrs[0].c_str());
				_esWindowHHmmUpper = splitstrs[1].c_str(); // TimeUtils::hhmmToMinutes(splitstrs[1].c_str());
			}
		}
		else if (header == "MAX CALL OUT FDP") {
			_strMaxFDP = headeValue;
			_maxFDPMinutes = TimeUtils::hhmmToMinutes(headeValue);
		}
		else if (header == "EXTEND MAX FDP BY STANDBY(Y/N)") {
			_isExtendMaxFDPByStandby = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool MaxFdpForStandbyRuleParam::ignoreMaxCalloutFDP() const {
	return _strMaxFDP.empty() || _strMaxFDP == RuleParamConstant::ALL;
}

bool MaxFdpForStandbyRuleParam::ignoreExtendMaxFDPByStandby() const {
	return _isExtendMaxFDPByStandby == nullptr;
}

//判断是否在基地
bool MaxFdpForStandbyRuleParam::MatchHomeBase(const Duty& duty, const std::string& base) const {
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

bool MaxFdpForStandbyRuleParam::MatchComposition(const Duty& duty) const {
	if (_compositions.empty()) {
		return true;
	}
	bool isEditorModel = this->GetRule()->IsEditorModel();
	string compName = duty.getCompositionName();
	//Always recalcuate in editor application
	if (compName.empty() || isEditorModel) {
		compName = DutyUtils::GetCompositionByDutyFor3(&duty, this->GetRule()->GetDataContext());
		const_cast<Duty&>(duty).setCompositionName(compName);
	}

	auto iter = std::find(_compositions.cbegin(), _compositions.cend(), compName);
	return iter != _compositions.cend();
}

bool MaxFdpForStandbyRuleParam::MatchAcclimatizationState(const Duty& duty) const {
	if (_acclimatizationState.empty() || _acclimatizationState == RuleParamConstant::ALL) {
		return true;
	}
	return duty.getAcclimatisedState() == _acclimatizationState;
}

bool MaxFdpForStandbyRuleParam::MatchStandbyAssignmentGroups(const string& standbyAssignmentGroup) const {
	if (_standbyAssignmentGroups.empty()) {
		return true;
	}
	auto iter = std::find(_standbyAssignmentGroups.cbegin(), _standbyAssignmentGroups.cend(), standbyAssignmentGroup);
	return iter != _standbyAssignmentGroups.cend();
	return true;
}

bool MaxFdpForStandbyRuleParam::MatchStandbyAssignments(const string& standbyAssignment) const {
	if (_standbyAssignments.empty()) {
		return true;
	}
	auto iter = std::find(_standbyAssignments.cbegin(), _standbyAssignments.cend(), standbyAssignment);
	return iter != _standbyAssignments.cend();
}

bool MaxFdpForStandbyRuleParam::MatchSplitDuty(const Duty& duty) const {
	if (_isIncludingSplitDuty == nullptr) {
		return true;
	}
	bool isSplitDuty = duty.isSplitDuty();
	if (isSplitDuty != *_isIncludingSplitDuty) {
		return false;
	}
	//非Split Duty则不需要判断Min Split Rest 
	if (!isSplitDuty) {
		return true;
	}
	return duty.splitDutyDurationInMins >= this->_minSplitRestMinutes;
}

//匹配SplitDuty和机场休息设施
bool MaxFdpForStandbyRuleParam::MatchSplitDutyAndRestFacility(const Duty& duty) const {
	if (_isIncludingSplitDuty == nullptr) {
		return true;
	}
	bool isSplitDuty = duty.isSplitDuty();
	if (isSplitDuty != *_isIncludingSplitDuty) {
		return false;
	}
	//非Split Duty则不需要判断Min Split Rest 和 机场休息设施
	if (!isSplitDuty) {
		return true;
	}

	for (std::size_t i = 0; i < duty.getNumSegments(); i++) {
		Segment* segment = duty.getSegment(i);

		if (segment->isSplitDuty()) {

			//if (duty.splitDutyDurationInMins < this->_minSplitRestMinutes) {
			if (segment->getTransitRestMins() < this->_minSplitRestMinutes) {
				return false;
			}

			if (this->_restFacility != RuleParamConstant::ALL && segment->getArrStationRestFacilty() != this->_restFacility) {
				return false;
			}

		}
	}
	return true;
}

//匹配机场休息设施
bool MaxFdpForStandbyRuleParam::MatchRestFacility(const Duty& duty) const {
	if (this->_restFacility == RuleParamConstant::ALL) {
		return true;
	}
	for (std::size_t i = 0; i < duty.getNumSegments(); i++) {
		Segment* segment = duty.getSegment(i);
		if (segment->getArrStationRestFacilty() == this->_restFacility) {
			return true;
		}
	}
	return false;
}

//匹配时间窗口范围(不违法 WOCL，需要取反)
bool MaxFdpForStandbyRuleParam::MatchWOCLWindow(const Duty& duty) const {
	if (this->_woclWindow == RuleParamConstant::ALL) {
		return true;
	}

	auto depOffsetMinutes = DutyUtils::GetTimeZoneOffsetByDep(duty, this->GetRule()->GetDataContext());
	auto arvOffsetMinutes = DutyUtils::GetTimeZoneOffsetByArr(duty, this->GetRule()->GetDataContext());

	const auto& fdpStartUtc = duty.getFDPStartUtcTimes();
	const auto& fdpEndUtc = duty.getFDPEndUtcTimes();

	return !TimeUtils::IsTimesCovered(fdpStartUtc + depOffsetMinutes * 60, fdpEndUtc + arvOffsetMinutes * 60,
		TimeUtils::hhmmToMinutes(_woclWindowHHmmLower), TimeUtils::hhmmToMinutes(_woclWindowHHmmUpper));
}

//匹配时间窗口范围(不违法Early Start（0200-0659），需要取反)
bool MaxFdpForStandbyRuleParam::MatchEarlyStartWindow(const Duty& duty) const {
	if (this->_esWindow == RuleParamConstant::ALL) {
		return true;
	}

	time_t dutyStartTimeLoc = duty.getStartTimeLocAct();
	time_t startTime = -1, endTime = -1;
	TimeUtils::GetAbsoluteTime(startTime, endTime, dutyStartTimeLoc, _esWindowHHmmLower, _esWindowHHmmUpper);
	return !(dutyStartTimeLoc >= startTime && dutyStartTimeLoc < endTime);
}

//匹配规则参数是否满足
bool MaxFdpForStandbyRuleParam::MatchParam(const string& standbyAssignmentGroup, const string& standbyAssignment, const Duty& duty, const string& base) const {

	
	if (!MatchHomeBase(duty, base)) {
		return false;
	}

	if (!MatchStandbyAssignmentGroups(standbyAssignmentGroup)) {
		return false;
	}

	if (!MatchStandbyAssignments(standbyAssignment)) {
		return false;
	}

	if (!MatchComposition(duty)) {
		return false;
	}

	if (!MatchAcclimatizationState(duty)) {
		return false;
	}

	//if (!MatchSplitDuty(duty)) {
	//	return false;
	//}

	//if (!MatchRestFacility(duty)) {
	//	return false;
	//}

	if (!MatchSplitDutyAndRestFacility(duty)) {
		return false;
	}

	if (!MatchWOCLWindow(duty)) {
		return false;
	}

	if (!MatchEarlyStartWindow(duty)) {
		return false;
	}
	return true;
}
