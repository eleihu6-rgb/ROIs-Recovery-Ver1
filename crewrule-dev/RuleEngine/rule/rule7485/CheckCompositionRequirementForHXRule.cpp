#include "CheckCompositionRequirementForHXRule.h"

#include "Utility.h"

#include <ctime>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "CheckCompositionRequirementForHXRuleParam.h"
#include "../utils/DutyUtils.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "TimezoneUtils.h"

bool CheckCompositionRequirementForHXRule::CheckRule(const Duty* duty) const {

	if (DutyUtils::IsAcclimation(duty, this->GetDataContext())) {
		return this->CheckAcclimatizeDuty(duty);
	}
	else {
		return this->CheckUnkownDuty(duty, duty->getBase());
	}

}

bool CheckCompositionRequirementForHXRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {

	if (rosters.empty()) {
		return true;
	}
	const auto& crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = crew->getPrimeBase();

	for (size_t i = 0; i < rosters.size(); i++) {
		if (rosters[i]->pairing) {
			auto duties = rosters[i]->pairing->getDutyVec();
			for (size_t j = 0; j < duties.size(); j++) {
				if (DutyUtils::IsAcclimation(duties[j], this->GetDataContext())) {
					if (i != 0 && j == 0) {
						this->CheckAcclimatizeDuty(duties[j], rosters[i - 1]);
					}
					else {
						this->CheckAcclimatizeDuty(duties[j]);
					}
				}
				else {
					// unkown 状态下，第一个roster的第一个duty，没法计算前序休息，直接赋值数据库中max fdp
					if (i == 0 && j == 0) {
						
					}
					if (j == 0)
						this->CheckUnkownDuty(duties[j], base, rosters[i - 1]);
					else
						this->CheckUnkownDuty(duties[j], base, nullptr, duties[j - 1]);
				}
			}

		}
	}
	return true;
}

bool CheckCompositionRequirementForHXRule::CheckAcclimatizeDuty(const Duty* duty, const ROSTER* prevRoster) const {

	if (_accRuleParams.empty())
		return true;

	int fdpDiscretionMinutes = 0;
	if (duty->supportDiscretionType(DiscretionType::FDP)) {
		fdpDiscretionMinutes = this->_dbData->getManualDiscretion(DiscretionType::FDP);
	}

	for (const auto& _ruleParam : _accRuleParams) {
		
		_ruleViolation.SetRuleParam(_ruleParam);

		time_t calloutTime = 0;
		if (prevRoster)
			calloutTime = prevRoster->calloutUtc;

		time_t checkInTime = DutyUtils::GetDutyStartTimeByRuleParamForHX(duty, prevRoster, calloutTime);
		if (checkInTime <= 0) {
			checkInTime = duty->getFirstBreif()->getStartTimeUtcAct();
		}

		if (MatchedRuleWhenAcclimatize(duty, _ruleParam, checkInTime)) {
			if (_application == PAIRING_OPTIMIZER && duty->getCompositionName() != _ruleParam._compositionRequirement) {
				return false;
			}
			_ruleViolation.SetParam("start", to_string(duty->getStartTimeUtcAct()));
			_ruleViolation.SetParam("end", to_string(duty->getEndTimeUtcAct()));
			_ruleViolation.SetParam("composition", joinStrList(_ruleParam._compositions));
			_ruleViolation.SetParam("requireComposition", _ruleParam._compositionRequirement);
			_ruleViolation.SetParam("pairing_id", std::to_string(duty->getPairingId()));
			if (prevRoster) {
				_ruleViolation.SetParam("crew_id", prevRoster->idcrew);
			}
			ThrowRuleViolation();

		}
	}
	return true;
}

bool CheckCompositionRequirementForHXRule::CheckUnkownDuty(const Duty* duty, const string base, const ROSTER* prevRoster, const Duty* prevDuty) const {

	if (_unAccRuleParams.empty())
		return true;

	if (this->_application == PAIRING_EDITOR) {
		return this->CheckAcclimatizeDuty(duty);
		
	}
	else if (duty->getDutySeq() == 1 && (prevRoster == NULL && prevDuty == NULL)) {
		return this->CheckAcclimatizeDuty(duty);
	}

	time_t prevDutyEndTime = 0;
	if (prevRoster)
		prevDutyEndTime = prevRoster->getRestStartUtcAct();
	else if (prevDuty)
		prevDutyEndTime = prevDuty->getEndTimeUtcAct();

	string zoneId = this->_dbData->getAirportZoneId(base);
	int offset = TimezoneUtils::GetTimezoneOffset(duty->getStartTimeUtcAct(), zoneId);

	for (const auto& _ruleParam : _unAccRuleParams) {
		_ruleViolation.SetRuleParam(_ruleParam);
		if (MatchedRuleWhenUnknown(duty, _ruleParam, prevDutyEndTime, offset)) {
			if (_application == PAIRING_OPTIMIZER && duty->getCompositionName() != _ruleParam._compositionRequirement) {
				return false;
			}
			_ruleViolation.SetParam("start", to_string(duty->getStartTimeUtcAct()));
			_ruleViolation.SetParam("end", to_string(duty->getEndTimeUtcAct()));
			_ruleViolation.SetParam("composition", joinStrList(_ruleParam._compositions));
			_ruleViolation.SetParam("requireComposition", _ruleParam._compositionRequirement);
			_ruleViolation.SetParam("pairing_id", std::to_string(duty->getPairingId()));
			if (prevRoster) {
				_ruleViolation.SetParam("crew_id", prevRoster->idcrew);
				
			}
			ThrowRuleViolation();
		}
	}
	
	return true;
}

void CheckCompositionRequirementForHXRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		if (dbRule.tableNum == 2) {
			_unAccRuleParams.emplace_back(CheckCompositionRequirementForHXRuleParam(this));
			auto& newParam = _unAccRuleParams.back();
			newParam.ParseParam(dbRule);
		}
		else {
			_accRuleParams.emplace_back(CheckCompositionRequirementForHXRuleParam(this));
			auto& newParam = _accRuleParams.back();
			newParam.ParseParam(dbRule);
		}

	}
}

bool CheckCompositionRequirementForHXRule::MatchedRuleWhenAcclimatize(const Duty* duty, const CheckCompositionRequirementForHXRuleParam _ruleParam, const time_t checkInTime) const {

	if (!_ruleParam._dutyAssignments.empty() && !_ruleParam._dutyAssignments[0].empty() && _ruleParam._dutyAssignments[0] != "*"
		&& find(_ruleParam._dutyAssignments.begin(), _ruleParam._dutyAssignments.end(), duty->getAssignment()) == _ruleParam._dutyAssignments.end())
		return false;

	time_t checkin = checkInTime;// GetDutyCheckinTime(duty, maxFdpAfterDelayDefinition);

	// 加上适应的时区秒数
	checkin += duty->getRefTimeZone() * 60;

	int landing = GetDutyLandingNumber(duty);
	string strComplement = duty->getCompositionName();
	if (strComplement == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
	{
		strComplement = DutyUtils::GetCompositionByDutyFor3(duty, this->_dbData);				
	}

	string strBase = duty->getDepStation();
	bool bIsBunk = true;
	auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(strBase);

	long fdp = duty->getFDPInSecs();
	int rptStartMinutes = hhmmToMinutes(_ruleParam._rptStart.c_str());
	int rptEndMinutes = hhmmToMinutes(_ruleParam._rptEnd.c_str());

	const auto& dutyBlh = duty->getActualBlockTime();
	if (!_ruleParam._dutyBlhRange.empty() && _ruleParam._dutyBlhRange != "*") {
		if (dutyBlh < _ruleParam._dutyBlhLower || dutyBlh > _ruleParam._dutyBlhUpper)
			return false;
	}

	bool matchSchFlt = false;
	bool matchSectorFlt = false;
	for (const auto& seg : duty->getSegmentsRead()) {
		if (!_ruleParam._schFltWindowRange.empty() && _ruleParam._schFltWindowRange != "*") {
			if (TimeUtils::IsTimesCovered(seg->getStartTimeLocSch(), seg->getEndTimeLocSch(), _ruleParam._schFltWindowLower, _ruleParam._schFltWindowUpper)) {
				matchSchFlt = true;
			}
		}
		if (!_ruleParam._sectorBlhRange.empty() && _ruleParam._sectorBlhRange != "*") {
			if (seg->getBlkMinutes() >= _ruleParam._sectorBlhLower && seg->getBlkMinutes() <= _ruleParam._sectorBlhUpper) {
				matchSectorFlt = true;
			}
		}
	}
	if (!matchSchFlt || !matchSectorFlt)
		return false;

	bool isInRange = TimeUtils::IsTimesInRange(checkin, rptStartMinutes, rptEndMinutes);
	if (isInRange && (landing <= _ruleParam._landingUpper && landing >= _ruleParam._landingLower) && (_ruleParam._compositions.size() == 0 || _ruleParam._compositions[0] == "*" || find(_ruleParam._compositions.begin(), _ruleParam._compositions.end(), strComplement) != _ruleParam._compositions.end())) {
		return true;
	}
	return false;
}

bool CheckCompositionRequirementForHXRule::MatchedRuleWhenUnknown(const Duty* duty, const CheckCompositionRequirementForHXRuleParam _ruleParam, const time_t prevDutyEndTime, const int offsetMinutes) const {

	//time_t dutyCheckInTime = duty->getStartTimeUtcAct();
	time_t dutyCheckInTime = duty->getFirstBreif()->getStartTimeUtcAct();

	if (prevDutyEndTime <= 0) {
		return false;
	}

	// 计算 length of preceding rest
	long precedingRest = 0;

	precedingRest = DutyUtils::GetPrecedingRestLength(prevDutyEndTime, dutyCheckInTime, offsetMinutes);

	int landing = GetDutyLandingNumber(duty);

	string strComplement = duty->getCompositionName();
	if (strComplement == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
	{
		strComplement = DutyUtils::GetCompositionByDutyFor3(const_cast<Duty*>(duty), this->_dbData);

	}

	if (_ruleParam._dutyAssignments.size() > 0 && _ruleParam._dutyAssignments[0] != "*") {
		if (find(_ruleParam._dutyAssignments.begin(), _ruleParam._dutyAssignments.end(), duty->getAssignment()) == _ruleParam._dutyAssignments.end()) {
			return false;
		}
	}

	if (!_ruleParam._precedingRestRange.empty() && _ruleParam._precedingRestRange != "*") {
		if (_ruleParam._precedingRestLower * 3600 > precedingRest || _ruleParam._precedingRestUpper * 3600 <= precedingRest) {
			return false;
		}
	}

	if (_ruleParam._compositions.size() > 0 && _ruleParam._compositions[0] != "*") {
		if (find(_ruleParam._compositions.begin(), _ruleParam._compositions.end(), strComplement) == _ruleParam._compositions.end()) {
			return false;
		}
	}

	if (_ruleParam._landingLower != -1 || _ruleParam._landingUpper != -1) {
		if (landing < _ruleParam._landingLower || landing > _ruleParam._landingUpper) {
			return false;
		}
	}

	return true;
}


void CheckCompositionRequirementForHXRule::ThrowRuleViolation() const {

	string requireComposition = _ruleViolation.GetParam("requireComposition");
	string pairingId = _ruleViolation.GetParam("pairing_id");
	string errorMsg = "The pairing(" + pairingId + ") need the " + requireComposition + ".";

	string crewid = _ruleViolation.GetParam("crew_id");
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->pairingId = stoll(pairingId);
	rv->startDTUtc = stol(_ruleViolation.GetParam("start"));
	rv->endDTUtc = stol(_ruleViolation.GetParam("end"));
	rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	if (!crewid.empty()) {
		rv->crewId = crewid;
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	rv->violation_msg = errorMsg;
	_ruleViolation.AddRuleViolations(rv);
}

// 计算航班数，如果模拟机在飞行航班前，算一腿，如果是duty内最后一个航班数模拟机，则不算
int CheckCompositionRequirementForHXRule::GetDutyLandingNumber(const Duty* duty) const {
	int num = 0;

	bool simCount = false;
	const auto& segments = duty->getSegmentsRead();
	for (int i = segments.size() - 1; i >= 0; i--) {
		const auto& seg = segments[i];
		if (seg->getAssignment() == "FLY")
			simCount = true;

		if (simCount && seg->getIsOperating())
			num++;
	}

	return num;
}
