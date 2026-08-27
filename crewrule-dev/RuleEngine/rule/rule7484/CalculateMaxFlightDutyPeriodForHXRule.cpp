#include "CalculateMaxFlightDutyPeriodForHXRule.h"
#include "Utility.h"

#include <ctime>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "UtilDbg.h"
#include "StringUtil.h"
// #include "customBiz\customBiz.h"
#include "CalculateMaxFlightDutyPeriodForHXRuleParam.h"
#include "../utils/DutyUtils.h"
#include "../constant/Constants.h"
#include "../utils//TimeUtils.h"
#include "TimezoneUtils.h"

void CalculateMaxFlightDutyPeriodForHXRule::CalculateDuty(Duty* duty) {

	if (DutyUtils::IsAcclimation(duty, this->GetDataContext())) {
		this->CalculateAcclimatizeDuty(duty);
	}
	else {
		this->CalculateUnkownDuty(duty, duty->getBase());
	}
}

// for po
void CalculateMaxFlightDutyPeriodForHXRule::CalculateDuty(Pairing* pairing) {

	if (this->_application == PAIRING_OPTIMIZER) {
		for (size_t i = 0; i < pairing->getDutyVec().size(); i++) {
			auto duty = pairing->getDuty(i);
			if (DutyUtils::IsAcclimation(duty, this->GetDataContext())
				|| pairing->getDutyVec().size() < 2) {
				this->CalculateAcclimatizeDuty(duty);
			}
			else {
				this->CalculateUnkownDuty((int)i, pairing);
			}
		}
	}
	else {
		for (auto& duty : pairing->getDutyVec()) {
			CalculateDuty(duty);
		}
	}
}

void CalculateMaxFlightDutyPeriodForHXRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {

	if (rosters.empty())
		return;

	const auto& crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = crew->getPrimeBase();
	const ROSTER* previousRosterBeforeInput = nullptr;

	if (crew != nullptr) {
		const auto& crewRosters = crew->rosterList;
		for (size_t idx = 0; idx < crewRosters.size(); ++idx) {
			const auto* crewRoster = crewRosters[idx].get();
			if (crewRoster == nullptr) {
				continue;
			}
			if (crewRoster == rosters[0] || crewRoster->rosterId == rosters[0]->rosterId) {
				if (idx > 0) {
					previousRosterBeforeInput = crewRosters[idx - 1].get();
				}
				break;
			}
		}
	}


	for (size_t i = 0; i < rosters.size(); i++) {
		if (rosters[i]->pairing) {
			auto duties = rosters[i]->pairing->getDutyVec();
			for (size_t j = 0; j < duties.size(); j++) {
				const ROSTER* previousRoster = nullptr;
				if (j == 0) {
					if (i != 0) {
						previousRoster = rosters[i - 1];
					}
					else {
						previousRoster = previousRosterBeforeInput;
					}
				}

				if (DutyUtils::IsAcclimation(duties[j], this->GetDataContext())) {
					Duty* prevDuty = nullptr;
					if (j == 0) {
						if (previousRoster && previousRoster->pairing)
							prevDuty = previousRoster->pairing->getLastDuty();
						this->CalculateAcclimatizeDuty(duties[j], prevDuty, previousRoster);
					}
					else {
						prevDuty = duties[j - 1];
						this->CalculateAcclimatizeDuty(duties[j], prevDuty);
					}
				}
				else {
					// unkown 状态下，第一个roster的第一个duty，没法计算前序休息，直接赋值数据库中max fdp
					if (j == 0 && previousRoster == nullptr) {
						const auto& seg = duties[j]->getFirstFlySegment() ? duties[j]->getFirstFlySegment() : duties[j]->getFirstSegment();
						const auto & rf = this->_dbData->rosterFlightMgr.get(seg->getDBId(), rosters[i]->idcrew);
						
						// TODO: roster flight 新增max fdp字段
						if (rf != nullptr && rf->maxFdp > 0) {
							duties[j]->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, rf->maxFdp, -1, -1, "", "Initial Max FDP from Roster Flight");
						}
					}
					else if (j == 0) {
						Duty* prevDuty = nullptr;
						if (previousRoster && previousRoster->pairing)
							prevDuty = previousRoster->pairing->getLastDuty();
						this->CalculateUnkownDuty(duties[j], base, previousRoster, prevDuty);
					}
					else
						this->CalculateUnkownDuty(duties[j], base, nullptr, duties[j - 1]);
				}
			}

		}
	}
}

void CalculateMaxFlightDutyPeriodForHXRule::CalculateAcclimatizeDuty(Duty* duty, const Duty* prevDuty, const ROSTER* prevRoster) {

	if (_accRuleParams.empty())
		return;

	CalculateMaxFlightDutyPeriodForHXRuleParam* ruleParam = nullptr;

	time_t calloutTime = 0;
	if (prevRoster)
		calloutTime = prevRoster->calloutUtc;

	time_t checkInTime = DutyUtils::GetDutyStartTimeByRuleParamForHX(duty, prevRoster, calloutTime);

	if (prevRoster && prevRoster->isMergeFdpWithNext) {
		if (prevRoster->pairing) {
			const auto& lastDuty = prevRoster->pairing->getLastDuty();
			if (lastDuty)
				checkInTime = lastDuty->getStartTimeUtcAct();
		}
		else {
			checkInTime = prevRoster->getStartTimeUtcAct();
		}
	}

	if (checkInTime <= 0) {
		checkInTime = duty->getFirstBreif()->getStartTimeUtcAct();
	}

	ruleParam = GetMatchedRuleWhenAcclimatize(duty, checkInTime);

	if (ruleParam != nullptr && ruleParam->_maxFdp > 0) {
		long fdp = duty->getFDPInSecs();
		int reduceMaxFdp = 0;
		if (prevDuty && prevDuty->getManualFdpDiscretion() > 0) {
			time_t prevDutyRestStart = prevDuty->getEndTimeUtcAct();
			time_t currDutyStart = duty->getStartTimeUtcAct();
			int actRest = (currDutyStart - prevDutyRestStart) / 60;//单位分钟
			if (prevDuty->getMinRest() > actRest)
				reduceMaxFdp = prevDuty->getManualFdpDiscretion();
		}
		const auto oldMaxFdp = duty->getLimiation(RULE_LIMITATION_TYPE::MAX_FDP);
		if (!oldMaxFdp || oldMaxFdp->last_set_rule == ruleParam->GetId()) {
			duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, ruleParam->_maxFdp - reduceMaxFdp, ruleParam->GetId(), ruleParam->GetRuleParamId(), ruleParam->GetOverrideAbility(), ruleParam->GetClassType(), ruleParam->GetDescription(), ruleParam->GetReference(), true);
		}
		else {
			duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, ruleParam->_maxFdp - reduceMaxFdp, ruleParam->GetId(), ruleParam->GetRuleParamId(), ruleParam->GetOverrideAbility(), ruleParam->GetDescription(), ruleParam->GetReference());
		}
	}
}

CalculateMaxFlightDutyPeriodForHXRuleParam* CalculateMaxFlightDutyPeriodForHXRule::GetMatchedRuleWhenAcclimatize(Duty* duty, const time_t checkInTime) {
	CalculateMaxFlightDutyPeriodForHXRuleParam* resultRuleParam = nullptr;
	for (auto& _ruleParam : _accRuleParams) {
		CalculationManday FDP = this->_dbData->getCalculationManday("FDP");
		CalculationManday ACT_FDP = this->_dbData->getCalculationManday("ACT FDP");
		if (_ruleParam._maxFdp) {

			if (!_ruleParam._dutyAssignments.empty() && !_ruleParam._dutyAssignments[0].empty() && _ruleParam._dutyAssignments[0] != "*"
				&& find(_ruleParam._dutyAssignments.begin(), _ruleParam._dutyAssignments.end(), duty->getAssignment()) == _ruleParam._dutyAssignments.end())
				continue;

			// Check Single Fly Sector Blh Range
			if (!_ruleParam.MatchSingleFlySectorBlhRange(duty))
				continue;

			// Check Rest Facility
			if (!_ruleParam.MatchRestFacility(duty))
				continue;

			time_t checkin = checkInTime;// GetDutyCheckinTime(duty, maxFdpAfterDelayDefinition);

			// 加上适应的时区秒数
			checkin += duty->getRefTimeZone() * 60;

			int landing = GetDutyLandingNumber(duty);
			string strComplement = duty->getCompositionName();
			if (strComplement == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
			{
				strComplement = DutyUtils::GetCompositionByDutyFor3(duty, this->_dbData);
				//strComplement = this->pairingCompositionCalculator->calculatePairingCompositionForPilotR5_3007(duty);
				duty->setCompositionName(strComplement);
			}

			string strBase = duty->getDepStation();
			bool bIsBunk = true;
			auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(strBase);

			long fdp = duty->getFDPInSecs();
			int rptStartMinutes = hhmmToMinutes(_ruleParam._rptStart.c_str());
			int rptEndMinutes = hhmmToMinutes(_ruleParam._rptEnd.c_str());

			bool isInRange = TimeUtils::IsTimesInRange(checkin, rptStartMinutes, rptEndMinutes);
			if (isInRange && (landing <= _ruleParam._landingUpper && landing >= _ruleParam._landingLower) && (_ruleParam._compositions.size() == 0 || _ruleParam._compositions[0] == "*" || find(_ruleParam._compositions.begin(), _ruleParam._compositions.end(), strComplement) != _ruleParam._compositions.end())) {
				//if (resultRuleParam == nullptr || resultRuleParam->_maxFdp > _ruleParam._maxFdp) {
				//	//返回最严格的规则（即maxFDP最小的规则）
				//	resultRuleParam = &_ruleParam;
				//}

				//返回匹配的第一条
				return &_ruleParam;
			}
		}
	}
	return resultRuleParam;
}

time_t CalculateMaxFlightDutyPeriodForHXRule::GetDutyCheckInTime(const Duty* duty, const std::shared_ptr<max_fdp_after_delay_definition>& maxFdpAfterDelayDefinition) {
	time_t checkInTime = -1;
	if (maxFdpAfterDelayDefinition == nullptr) {
		return checkInTime;
	}
	if (maxFdpAfterDelayDefinition->revisedOrOriginalFDPStartTime == "*") {
		return checkInTime;
	}
	Segment* firstSegemnt = duty->getFirstSegment();
	int delay = static_cast<int>(firstSegemnt->getStartTimeUtcAct() - firstSegemnt->getStartTimeUtcSch());
	if (delay <= 0) {
		return checkInTime;
	}
	if (delay >= maxFdpAfterDelayDefinition->totalFlightDelayMinutesLower * 60
		&& delay < maxFdpAfterDelayDefinition->totalFlightDelayMinutesUpper * 60) {
		if (maxFdpAfterDelayDefinition->revisedOrOriginalFDPStartTime == "R") {
			//航班延误后，采用修正FDP开始时间作为基准
			checkInTime = duty->getStartTimeUtcAct() + maxFdpAfterDelayDefinition->fdpStartTimeDeltaMinutes * 60;
		}
		else {
			//航班延误后，采用原FDP开始时间作为基准
			checkInTime = duty->getOriginalStartTimeUtcSch() + maxFdpAfterDelayDefinition->fdpStartTimeDeltaMinutes * 60;
		}
	}
	return checkInTime;
}

void CalculateMaxFlightDutyPeriodForHXRule::CalculateUnkownDuty(int dutyIndex, Pairing* pairing) {

	auto duty = pairing->getDuty(dutyIndex);

	if (pairing->getDutyVec().size() < 2 || dutyIndex == 0) {
		this->CalculateAcclimatizeDuty(duty);
		return;
	}

	time_t prevDutyEndTime = pairing->getDuty(dutyIndex - 1)->getEndTimeUtcAct();

	CalculateMaxFlightDutyPeriodForHXRuleParam* ruleParam = nullptr;

	string base = pairing->getBase();
	string zoneId = this->_dbData->getAirportZoneId(base);
	int offset = TimezoneUtils::GetTimezoneOffset(duty->getStartTimeUtcAct(), zoneId);

	ruleParam = GetMatchedRuleWhenUnknown(duty, prevDutyEndTime, offset);

	if (ruleParam != nullptr && ruleParam->_maxFdp > 0) {
		duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, ruleParam->_maxFdp, ruleParam->GetId(), ruleParam->GetRuleParamId(), ruleParam->GetDescription(), ruleParam->GetReference());
	}
}

void CalculateMaxFlightDutyPeriodForHXRule::CalculateUnkownDuty(Duty* duty, const string base, const ROSTER* prevRoster, const Duty* prevDuty) {

	if (_unAccRuleParams.empty())
		return;

	if (this->_application == PAIRING_EDITOR) {
		this->CalculateAcclimatizeDuty(duty);
		return;
	}
	else if (duty->getDutySeq() == 1 && (prevRoster == NULL && prevDuty == NULL)) {
		this->CalculateAcclimatizeDuty(duty);
		return;
	}

	if (duty->getDutySeq() > 1 && prevDuty == NULL) {
		auto pairingIter = this->_dbData->pairingIdMap.find(duty->getPairingId());
		if (pairingIter != this->_dbData->pairingIdMap.end()) {
			prevDuty = pairingIter->second->getDuty(duty->getDutySeq() - 2);
		}
	}

	CalculateMaxFlightDutyPeriodForHXRuleParam* ruleParam = nullptr;

	time_t prevDutyEndTime = 0;
	if (prevRoster)
		prevDutyEndTime = prevRoster->getRestStartUtcAct();
	else if (prevDuty)
		prevDutyEndTime = prevDuty->getEndTimeUtcAct();

	string zoneId = this->_dbData->getAirportZoneId(base);
	int offset = TimezoneUtils::GetTimezoneOffset(duty->getStartTimeUtcAct(), zoneId);


	ruleParam = GetMatchedRuleWhenUnknown(duty, prevDutyEndTime, offset);

	if (ruleParam != nullptr && ruleParam->_maxFdp > 0) {
		int reduceMaxFdp = 0;
		if (prevDuty && prevDuty->getManualFdpDiscretion() > 0) {
			time_t prevDutyRestStart = prevDuty->getEndTimeUtcAct();
			time_t currDutyStart = duty->getStartTimeUtcAct();
			int actRest = (currDutyStart - prevDutyRestStart) / 60;//单位分钟
			if (prevDuty->getMinRest() > actRest)
				reduceMaxFdp = prevDuty->getManualFdpDiscretion();
		}
		duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, ruleParam->_maxFdp - reduceMaxFdp, ruleParam->GetId(), ruleParam->GetRuleParamId(), ruleParam->GetOverrideAbility(), ruleParam->GetClassType(), ruleParam->GetDescription(), ruleParam->GetReference(), true, true);
	}
}

CalculateMaxFlightDutyPeriodForHXRuleParam* CalculateMaxFlightDutyPeriodForHXRule::GetMatchedRuleWhenUnknown(Duty* duty, const time_t prevDutyEndTime, const int offsetMinutes) {
	CalculateMaxFlightDutyPeriodForHXRuleParam* resultRuleParam = nullptr;

	//time_t dutyCheckInTime = duty->getStartTimeUtcAct();
	time_t dutyCheckInTime = duty->getFirstBreif()->getStartTimeUtcAct();

	if (prevDutyEndTime <= 0) {
		return nullptr;
	}

	// 计算 length of preceding rest
	long precedingRest = dutyCheckInTime - prevDutyEndTime;
	
	//precedingRest = DutyUtils::GetPrecedingRestLength(prevDutyEndTime, dutyCheckInTime, offsetMinutes);

	int landing = GetDutyLandingNumber(duty);

	string strComplement = duty->getCompositionName();
	if (strComplement == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
	{
		strComplement = DutyUtils::GetCompositionByDutyFor3(const_cast<Duty*>(duty), this->_dbData);
		
	}
	for (auto& _ruleParam : _unAccRuleParams) {

		if (_ruleParam._dutyAssignments.size() > 0 && _ruleParam._dutyAssignments[0] != "*") {
			if (find(_ruleParam._dutyAssignments.begin(), _ruleParam._dutyAssignments.end(), duty->getAssignment()) == _ruleParam._dutyAssignments.end()) {
				continue;
			}
		}

		if (!_ruleParam._precedingRestRange.empty() && _ruleParam._precedingRestRange != "*") {
			if (_ruleParam._precedingRestLower * 60 > precedingRest || _ruleParam._precedingRestUpper * 60 <= precedingRest) {
				continue;
			}
		}

		if (_ruleParam._compositions.size() > 0 && _ruleParam._compositions[0] != "*") {
			if (find(_ruleParam._compositions.begin(), _ruleParam._compositions.end(), strComplement) == _ruleParam._compositions.end()) {
				continue;
			}
		}

		if (_ruleParam._landingLower != -1 || _ruleParam._landingUpper != -1) {
			if (landing < _ruleParam._landingLower || landing > _ruleParam._landingUpper) {
				continue;
			}
		}

		// Check Single Fly Sector Blh Range
		if (!_ruleParam.MatchSingleFlySectorBlhRange(duty))
			continue;

		// Check Rest Facility
		if (!_ruleParam.MatchRestFacility(duty))
			continue;

		//if (resultRuleParam == nullptr || resultRuleParam->_maxFdp > _ruleParam._maxFdp) {
		//	//返回最严格的规则（即maxFDP最小的规则）
		//	resultRuleParam = &_ruleParam;
		//}

		return &_ruleParam;
	}
	return resultRuleParam;
}

void CalculateMaxFlightDutyPeriodForHXRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		if (dbRule.tableNum == 2) {
			_unAccRuleParams.emplace_back(CalculateMaxFlightDutyPeriodForHXRuleParam(this));
			auto& newParam = _unAccRuleParams.back();
			newParam.ParseParam(dbRule);
		}
		else {
			_accRuleParams.emplace_back(CalculateMaxFlightDutyPeriodForHXRuleParam(this));
			auto& newParam = _accRuleParams.back();
			newParam.ParseParam(dbRule);
		}
		
	}
}

// 计算航班数，如果模拟机在飞行航班前，算一腿，如果是duty内最后一个航班数模拟机，则不算
int CalculateMaxFlightDutyPeriodForHXRule::GetDutyLandingNumber(const Duty* duty) const {
	int num = 0;
	
	bool simCount = false;
	const auto & segments = duty->getSegmentsRead();
	for (int i = segments.size() - 1; i >= 0; --i) {
		const auto& seg = segments[i];
		if (seg->getAssignment() == "FLY")
			simCount = true;
		
		if (simCount && seg->getIsOperating())
			num++;
	}

	return num;
}
