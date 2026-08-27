/**
 * @file CheckDisruptiveSchedulesLocalNightForTGRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CheckDisruptiveSchedulesLocalNightForTGRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"
#include "index/TmProgramIndex.h"
#include "index/TmFootprintIndex.h"


using namespace std;

void CheckDisruptiveSchedulesLocalNightForTGRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "DUTY A TYPES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyATypes);
			}
		}
		else if (header == "DUTY B TYPES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyBTypes);
			}
		}
		else if (header == "DUTY A ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyAAssignments);
			}
		}
		else if (header == "DUTY B ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _dutyBAssignments);
			}
		}
		else if (header == "IS DUTY A HOME BASE") {
			_isDutyAHomeBase = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "IS DUTY B HOME BASE") {
			_isDutyBHomeBase = (headeValue == RuleParamConstant::ALL) ? nullptr : std::make_unique<bool>(headeValue == RuleParamConstant::YES);
		}
		else if (header == "MIN LOCAL NIGHT") {
			if (headeValue != RuleParamConstant::ALL) {
				_minLocalNight = stoi(headeValue);
			}
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckDisruptiveSchedulesLocalNightForTGRuleParam::MatchAssignments(const string dutyAAssignment, const string dutyBAssignment) const {
	if (!_dutyAAssignments.empty() && _dutyAAssignments[0] != "" && _dutyAAssignments[0] != "*" &&
		find(_dutyAAssignments.begin(), _dutyAAssignments.end(), dutyAAssignment) == _dutyAAssignments.end())
		return false;

	if (!_dutyBAssignments.empty() && _dutyBAssignments[0] != "" && _dutyBAssignments[0] != "*" &&
		find(_dutyBAssignments.begin(), _dutyBAssignments.end(), dutyBAssignment) == _dutyBAssignments.end())
		return false;

	return true;
}

bool CheckDisruptiveSchedulesLocalNightForTGRuleParam::MatchDutyATypes(const Duty* dutyA) const {
	
	if (_dutyATypes.empty() || _dutyATypes[0] == "" || _dutyATypes[0] == "*")
		return true;

	const auto & ref = dutyA->getRefTimeZone();

	if (DutyUtils::IsEarlyStartDuty(dutyA) && find(_dutyATypes.begin(), _dutyATypes.end(), "ESD") != _dutyATypes.end())
		return true;

	if (DutyUtils::IsLateFinishTime(dutyA->getEndTimeUtcAct(), ref) && find(_dutyATypes.begin(), _dutyATypes.end(), "LFD") != _dutyATypes.end())
		return true;

	if (DutyUtils::IsEarlyStartDuty(dutyA) && find(_dutyATypes.begin(), _dutyATypes.end(), "NG") != _dutyATypes.end())
		return true;

	return false;
}


bool CheckDisruptiveSchedulesLocalNightForTGRuleParam::MatchDutyBTypes(const Duty* dutyB) const {

	if (_dutyBTypes.empty() || _dutyBTypes[0] == "" || _dutyBTypes[0] == "*")
		return true;

	const auto& ref = dutyB->getRefTimeZone();

	if (DutyUtils::IsEarlyStartDuty(dutyB) && find(_dutyBTypes.begin(), _dutyBTypes.end(), "ESD") != _dutyBTypes.end())
		return true;

	if (DutyUtils::IsLateFinishTime(dutyB->getEndTimeUtcAct(), ref) && find(_dutyBTypes.begin(), _dutyBTypes.end(), "LFD") != _dutyBTypes.end())
		return true;

	if (DutyUtils::IsEarlyStartDuty(dutyB) && find(_dutyBTypes.begin(), _dutyBTypes.end(), "NG") != _dutyBTypes.end())
		return true;

	return false;
}

bool CheckDisruptiveSchedulesLocalNightForTGRuleParam::MatchAHomeBase(const Duty* duty, const string base) const {
	std::string pairingBase;
	if (!base.empty()) {
		// if PO mode, extract the base string from pairing and passed to this predicate
		pairingBase = base;
	}
	else {
		// if editor mode, base is extracted from the segment's pairing
		Pairing* pairing = this->GetRule()->GetDataContext()->pairingIdMap[duty->getPairingId()];
		if (pairing == nullptr) {
			spdlog::error("Pairing({}) do not exist.", duty->getPairingId());
			return true;
		}
		pairingBase = pairing->getBase();
	}
	return _isDutyAHomeBase == nullptr || BaseUtils::IsHomeBaseByBase(duty->getDepStationRead(), vector<string>(), pairingBase) == *_isDutyAHomeBase;
}

bool CheckDisruptiveSchedulesLocalNightForTGRuleParam::MatchBHomeBase(const Duty* duty, const string base) const {
	std::string pairingBase;
	if (!base.empty()) {
		// if PO mode, extract the base string from pairing and passed to this predicate
		pairingBase = base;
	}
	else {
		// if editor mode, base is extracted from the segment's pairing
		Pairing* pairing = this->GetRule()->GetDataContext()->pairingIdMap[duty->getPairingId()];
		if (pairing == nullptr) {
			spdlog::error("Pairing({}) do not exist.", duty->getPairingId());
			return true;
		}
		pairingBase = pairing->getBase();
	}
	return _isDutyBHomeBase == nullptr || BaseUtils::IsHomeBaseByBase(duty->getDepStationRead(), vector<string>(), pairingBase) == *_isDutyBHomeBase;
}