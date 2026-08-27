#include "CalculateMaxFlightDutyTimeRule.h"

#include "Utility.h"

#include <ctime>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "MaxFlightDutyTimeRuleParam.h"
#include "utils/DutyUtils.h"
#include "utils//TimeUtils.h"

void CalculateMaxFlightDutyTimeRule::CalculateDuty(Duty *duty) {
	if (this->_ruleParams.empty()) {
		return;
	}

	
	this->CalculateFlightTime(duty);
}

void CalculateMaxFlightDutyTimeRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty()) {
		return;
	}

	for (auto roster : rosters) {
		for (auto duty : roster->pairing->getDutyVec()) {
			this->CalculateFlightTime(duty, roster);
		}
	}
}

void CalculateMaxFlightDutyTimeRule::CalculateFlightTime(Duty *duty, const ROSTER* roster) {
	for (const auto & _ruleParam : _ruleParams) {
		
		CalculationManday FDP = this->_dbData->getCalculationManday("FDP");
		CalculationManday ACT_FDP = this->_dbData->getCalculationManday("ACT FDP");
		if (_ruleParam._maxFdp) {

			//duty->calculateFDP(0, FDP.str, FDP.end);
			//duty->calculateFDP(1, ACT_FDP.str, ACT_FDP.end);
			string bunk = _ruleParam._restFacility;
			int RestFacility = 0;
			if (bunk != "" &&bunk != "*") {
				RestFacility = stoi(bunk);
			}
			int iLandingLow = 0, iLandingUpper = 999, lMaxFDP = 9999, lMaxDP = 9999, lMaxFT = 9999;
			iLandingLow = _ruleParam._landingLower;
			iLandingUpper = _ruleParam._landingUpper;
			//lMaxFDP是分钟
			lMaxFDP = _ruleParam._maxFdp;
			lMaxDP = _ruleParam._maxDp;
			lMaxFT = _ruleParam._maxFt;

			//duty->calculateFDP(0, FDP.str, FDP.end);
			//duty->calculateFDP(1, ACT_FDP.str, ACT_FDP.end);

			time_t checkin = duty->getStartTimeUtcAct();
			int landing = duty->getNumFlySegs();
			string strComplement = duty->getCompositionName();
			if (strComplement == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
			{
				strComplement = DutyUtils::GetCompositionByDutyFor3(const_cast<Duty*>(duty), this->_dbData);
				//strComplement = this->pairingCompositionCalculator->calculatePairingCompositionForPilotR5_3007(duty);
				duty->setCompositionName(strComplement);
			}
			int i = DutyUtils::GetRestfacility(duty, this->_dbData);
			//int i = 9999;
			//for (auto& segment : duty->getSegments())
			//{
			//	string tailNumber = segment->getTailNum();
			//	int ii = 0;
			//	if (this->_dbData->fltIdToAircraftMap.find(tailNumber) != this->_dbData->fltIdToAircraftMap.end()) {
			//		DBAircraft* aircraft = this->_dbData->fltIdToAircraftMap[tailNumber].get();
			//		if (aircraft->isExistRest) {
			//			ii = aircraft->restFacility;
			//		}
			//	}
			//	else if (this->_dbData->fleetMap.find(segment->getFleetCD()) != this->_dbData->fleetMap.end()) {
			//		FLEET fleet = this->_dbData->fleetMap[segment->getFleetCD()];
			//		if (fleet.restfacility > ii) {
			//			ii = fleet.restfacility;
			//		}
			//	}
			//	if (ii < i)i = ii;
			//}

			if (i != RestFacility && bunk != "*")continue;
			string strBase = duty->getDepStation();
			bool bIsBunk = true;
			auto offsetMinutes = _dbData->getAirportOffsetMinutes(strBase);
			int rptStartMinutes = hhmmToMinutes(_ruleParam._rptStart.c_str());
			int rptEndMinutes = hhmmToMinutes(_ruleParam._rptEnd.c_str());
			checkin += offsetMinutes * 60;
			long fdp = duty->getFDPInSecs();
			bool isInRange = TimeUtils::IsTimesInRange(checkin, rptStartMinutes, rptEndMinutes);
			if (isInRange && (landing <= iLandingUpper && landing >= iLandingLow) &&
					(_ruleParam._compositions.size() == 0 || _ruleParam._compositions[0] == "*" || find(_ruleParam._compositions.begin(), _ruleParam._compositions.end(), strComplement) != _ruleParam._compositions.end())) {
				if (_ruleParam._maxFdp > 0)
					duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, _ruleParam._maxFdp, _ruleParam.GetId(), _ruleParam.GetRuleParamId(), _ruleParam.GetOverrideAbility(), _ruleParam.GetClassType(), _ruleParam.GetDescription(), _ruleParam.GetReference());
				if (_ruleParam._maxDp > 0)
					duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_DP, _ruleParam._maxDp, _ruleParam.GetId(), _ruleParam.GetRuleParamId(), _ruleParam.GetOverrideAbility(), _ruleParam.GetClassType(), _ruleParam.GetDescription(), _ruleParam.GetReference());
				if (_ruleParam._maxFt > 0)
					duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_BLOCK, _ruleParam._maxFt, _ruleParam.GetId(), _ruleParam.GetRuleParamId(), _ruleParam.GetOverrideAbility(), _ruleParam.GetClassType(), _ruleParam.GetDescription(), _ruleParam.GetReference());
			}
		}
	}
}



void CalculateMaxFlightDutyTimeRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(MaxFlightDutyTimeRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}