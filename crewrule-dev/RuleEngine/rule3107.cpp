#pragma once

#include "RuleEngine.h"
#include "Utility.h"
#include <ctime>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
#include "utils/TimeUtils.h"
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"

bool LegalityChecker::checkFDPPerDutyByDuty_remind(Duty * duty, SharedPtr<ROSTER> roster){
	DBG_HELP("LegalityChecker::checkFDPPerDutyByDuty");
	if (!checkDutyIsNoOperating(duty)){
		return true;
	}
	auto& rules = this->_dbData->getRuleFunctions(RULES::REMIND_MAX_FDP_PERDUTY);
	for (auto& singleRule : rules){

		if (RosterUtils::ExistExceptionCode(roster.get(), duty, singleRule.exceptionCodes, this->_dbData)) {
			continue;
		}

		auto& parameter = singleRule.params;

		map<string, string>::const_iterator iter;

		string header, headeValue;
		/*
		3	INCLUDE LAST DHD, N
		2	INCLUDE CHECK OUT, N
		1	DEFINITION, VALUE
		4	COMPOSITION, RPT START, RPT END, LANDING LOWER, LANDINGS UPPER, REST FACILITY, MAX FDP
		*/
		string complement, bunk, landing_lower = "0", landing_upper = "99", max_fdp = "9999", checkin_lower = "00:00", checkin_upper = "23:59", max_extension,
			departure_start = "00:00", departure_end = "23:59", duty_type = "*", duty_fleet_str = "*", extension_ts_flags = "*", at_base_fdp_extension = "00:00", out_of_base_fdp_extension = "00:00",
			leg_sch_blh_start = "*", leg_sch_blh_end = "*";
		string includeCO, includeLastDHD;
		vector<string> compositions;
		vector<string> duty_fleets;
		vector<string> extension_ts_flag_list;
		bool isAugment = false;
		int RestFacility = 0;
		bool isCheckRule = false;
		int ltRestThreadhold = 0;
		int atBaseFDPExtension = 0;
		int outOfBaseFDPExtension = 0;
		double ltRestRatio = 0.0;
		int legSchBLHStart = 0;
		int legSchBLHEnd = 0;
		for (iter = parameter.begin(); iter != parameter.end(); iter++)
		{

			header = iter->first;
			headeValue = iter->second;
			//transform(header.begin(), header.end(), header.begin(), ::toupper);
			//transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);
			if (header == "COMPOSITION") {
				complement = headeValue;
				split(complement, '|', compositions);
			}
			if (header == "REST FACILITY") {
				bunk = headeValue;
				if (bunk != "" &&bunk != "*"){
					RestFacility = atoi(bunk.c_str());
				}
			}
			if (header == "LANDING LOWER") {
				landing_lower = headeValue;
			}
			if (header == "LANDINGS UPPER") {
				landing_upper = headeValue;
			}
			if (header == "RPT START") {
				checkin_lower = headeValue;
			}
			if (header == "RPT END") {
				checkin_upper = headeValue;
			}
			if (header == "MAX FDP") {
				max_fdp = headeValue;
				isCheckRule = true;
			}
			if (header == "MAX EXTENSION"){
				max_extension = headeValue;
			}
			if (header == "ISAUGMENT") {
				isAugment = (headeValue == "Y");
			}
			if (header == "DEPARTURE START") {
				departure_start = headeValue;
			}
			if (header == "DEPARTURE END") {
				departure_end = headeValue;
			}
			if (header == "DUTY TYPE" || header == "DUTY DIR") {
				duty_type = headeValue;
			}
			if (header == "DUTY FLEET") {
				duty_fleet_str = headeValue;
				split(headeValue, '|', duty_fleets);
			}
			if (header == "LT REST THREADHOLD") {
				ltRestThreadhold = TimeUtils::hhmmToMinutes(headeValue);
			}
			if (header == "LT REST RATIO") {
				ltRestRatio = stod(headeValue);
			}
			if (header == "EXTENSION TS FLAGS") {
				extension_ts_flags = headeValue;
				split(headeValue, '|', extension_ts_flag_list);
			}
			if (header == "AT BASE FDP EXTENSION") {
				at_base_fdp_extension = headeValue;
				atBaseFDPExtension = TimeUtils::hhmmToMinutes(at_base_fdp_extension);
			}
			if (header == "OUT OF BASE FDP EXTENSION") {
				out_of_base_fdp_extension = headeValue;
				outOfBaseFDPExtension = TimeUtils::hhmmToMinutes(out_of_base_fdp_extension);
			}
			if (header == "LEG SCH BLH START") {
				leg_sch_blh_start = headeValue;
				legSchBLHStart = TimeUtils::hhmmToMinutes(headeValue);
			}
			if (header == "LEG SCH BLH END") {
				leg_sch_blh_end = headeValue;
				legSchBLHEnd = TimeUtils::hhmmToMinutes(headeValue);
			}
		}
		if (_application == PAIRING_OPTIMIZER && (!RuleParams::GetInstancePtr()->canAugmented)){
			if (isAugment)
				continue;
		}
		//CalculationManday FDP = this->_dbData->calculationMandayMap["FDP"];
		//CalculationManday ACT_FDP = this->_dbData->calculationMandayMap["ACT FDP"];
		if (isCheckRule) {
			int iLandingLow = 0, iLandingUpper = 999, lMaxFDP = 9999, iMaxExtension = 0;//iMaxExtension单位为s
			int fdpDiscretion = 0;
			iLandingLow = stoi(landing_lower);
			iLandingUpper = stoi(landing_upper);
			//lMaxFDP是分钟
			lMaxFDP = stoi(max_fdp.substr(0, max_fdp.find(":"))) * 60 + stoi(max_fdp.substr(max_fdp.find(":") + 1));

			//20190529 ain, mantis#5584, 重构, 统一FDP计算流程为 customBiz.calculatePairingDutyTimes
			//duty->calculateFDP(0, FDP.str, FDP.end);
			//duty->calculateFDP(1, ACT_FDP.str, ACT_FDP.end);
			//calculatePairingDutyTimes(duty, this->_dbData.get());

			time_t checkinLocal = duty->getStartTimeLocAct();//getStartTime();
			//checkin = Utility::GetInstance().getLocalTime(checkin,duty->getDepStation());
			long fdp = duty->getFDPInSecs();
			//yuankai.cai mantis#6861 mergeFdp检查
			if (roster){
				if (roster->pairing->getFirstDuty()->getDutyId() == duty->getDutyId()){
					if (roster->dutyValues.getMergeFdp(0) != 0){
						fdp = roster->dutyValues.getMergeFdp(0) * 60;
					}
				}
				else if (roster->pairing->getLastDuty()->getDutyId() == duty->getDutyId()){
					if (roster->dutyValues.getMergeFdp((int)roster->pairing->getNumDuties() - 1) != 0){
						fdp = roster->dutyValues.getMergeFdp((int)roster->pairing->getNumDuties() - 1) * 60;
					}
				}
			}
			int i = DutyUtils::GetRestfacility(duty, this->_dbData);
			//int i = 9999;
			bool matchSchBLH = false;
			for (auto& segment : duty->getSegments())
			{
				//string tailNumber = segment->getTailNum();
				//int ii = 0;
				//if (this->_dbData->fltIdToAircraftMap.find(tailNumber) != this->_dbData->fltIdToAircraftMap.end()){
				//	DBAircraft* aircraft = this->_dbData->fltIdToAircraftMap[tailNumber].get();
				//	if (aircraft->isExistRest){
				//		ii = aircraft->restFacility;
				//	}
				//}
				//else if (this->_dbData->fleetMap.find(segment->getFleetCD()) != this->_dbData->fleetMap.end()){
				//	FLEET fleet = this->_dbData->fleetMap[segment->getFleetCD()];
				//	if (fleet.restfacility > ii){
				//		ii = fleet.restfacility;
				//	}
				//}
				//if (ii < i)i = ii;
				if ((leg_sch_blh_start.empty() || leg_sch_blh_start == "*") && (leg_sch_blh_end.empty() || leg_sch_blh_end == "*"))
					matchSchBLH = true;
				else {
					const auto& fltSchBLH = segment->getEndTimeUtcSch() - segment->getStartTimeUtcSch();
					if (fltSchBLH >= legSchBLHStart * 60 && fltSchBLH < legSchBLHEnd * 60)
						matchSchBLH = true;
				}
			}
			if (i != RestFacility && bunk != "*")continue;
			int landing = duty->getNumFlySegs();
			//map<string, int> mapComplement = duty->getComplementMap();
			//string strComplement = Utility::GetInstancePtr()->getComplement(mapComplement);
			//若seg延误则fdp可以延长
			if (fdp > lMaxFDP * 60){
				for (int i = (int)duty->getSegments().size() - 1; i < (int)duty->getSegments().size() && i > 0; i++){
					Segment* seg = duty->getSegment(i);
					if (seg->getEndTimeUtcAct() > seg->getEndTimeUtcSch()){
						iMaxExtension = hhmmStrToMinutes(max_extension) * 60;
						break;
					}
				}
			}
			string strComplement = duty->getCompositionName();
			if (strComplement == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
			{
				strComplement = this->getCompositionByDuty(duty);
				//strComplement = this->pairingCompositionCalculator->calculatePairingCompositionForPilotR5_3007(duty);
				duty->setCompositionName(strComplement);
			}
			string strBase = duty->getDepStation();
			bool bIsBunk = true;
			//auto offsetMinutes = _dbData->getAirportOffsetMinutes(strBase);

			time_t depTimeLocal = duty->getFirstSegment()->getStartTimeLocAct();
			bool departureInRange = TimeUtils::IsTimesInRange(depTimeLocal, TimeUtils::hhmmToMinutes(departure_start), TimeUtils::hhmmToMinutes(departure_end));

			bool dutyType = true;
			if (duty_type != "*")
				dutyType = DutyUtils::getDutyType(duty) == duty_type;

			bool dutyFleet = true;
			if (duty_fleet_str != "*") {
				const auto& seg = duty->getFirstFlySegment();
				if (seg) {
					string fleetGrp = this->_dbData->fleetMap[seg->getFleetCD()].fleetGrp;
					if (find(duty_fleets.begin(), duty_fleets.end(), fleetGrp) == duty_fleets.end())
						dutyFleet = false;
				}
			}

			// EVA
			if (ltRestThreadhold > 0 && ltRestRatio > 0) {
				if (duty->getNumSegments() > 1) {
					for (size_t i = 0; i < duty->getNumSegments() - 1; i++) {
						const auto currentSeg = duty->getSegments()[i];
						const auto nextSeg = duty->getSegments()[i + 1];
						if (SegmentUtils::existNode(duty, currentSeg, nextSeg)) {
							long ltTime = SegmentUtils::GetActualRestMinutes(duty, currentSeg, nextSeg) * 60;
							if (ltTime >= ltRestThreadhold * 60) {
								lMaxFDP += (int)(ltRestRatio * (ltTime / 60.0));
							}
						}
					}
				}
			}
			// EVA
			if (duty->getFdpDiscretion() > 0) {
				fdpDiscretion = duty->getFdpDiscretion();
			}
			int extensionULRFDP = 0;
			// EVA
			if (extension_ts_flags != "*" && extension_ts_flags != "" && roster) {
				const auto& crew = this->_dbData->crewIdMap[roster->idcrew];
				string crewbase = crew->getPrimeBase();
				for (const auto& rf : this->_dbData->rosterFlightMgr.getByPairingId(roster->pairId)) {
					if (rf->dutyId == duty->getDutyId() && rf->crewId == crew->idCrew && find(extension_ts_flag_list.begin(), extension_ts_flag_list.end(), rf->tsFlag) != extension_ts_flag_list.end()) {
						auto iterFlt = this->_dbData->flightIdMap.find(rf->fltId);
						if (iterFlt != this->_dbData->flightIdMap.end() && iterFlt->second != nullptr && iterFlt->second->getDepStation() == crewbase)
							extensionULRFDP = atBaseFDPExtension;
						else {
							extensionULRFDP = outOfBaseFDPExtension;
						}
					}

				}
			}
			//bool isInRange = Utility::GetInstancePtr()->IsTimesInRange(checkin, offsetMinutes, checkin_lower, checkin_upper);
			auto checkin_lower_minutes = TimeUtils::hhmmToMinutes(checkin_lower);
			auto checkin_upper_minutes = TimeUtils::hhmmToMinutes(checkin_upper);
			bool isInRange = TimeUtils::IsTimesInRange(checkinLocal, checkin_lower_minutes, checkin_upper_minutes);

			if (isInRange && departureInRange && dutyType && dutyFleet && matchSchBLH && (landing <= iLandingUpper && landing >= iLandingLow) && (complement == "*" || find(compositions.begin(), compositions.end(), strComplement) != compositions.end())) {
				if (fdp > (lMaxFDP + fdpDiscretion + extensionULRFDP) * 60 + iMaxExtension && iMaxExtension != 0){
					string errorMsg = "Flight duty period ({0:fdp}) is more than the extension limitation ({1:MaxFDP}), Crew Complement={2:complement}, Reported Time ({3:checkin_lower}-{4:checkin_upper}).";
					errorMsg = StringUtils::Format(errorMsg, Utility::GetInstancePtr()->formatMinutes(fdp / 60),
						Utility::GetInstancePtr()->formatMinutes(lMaxFDP + iMaxExtension / 60), 
						complement, checkin_lower, checkin_upper);

					duty->setViolationMessage(errorMsg);
					duty->setLegality(false);
					RULE_VIOLATION* rv = new RULE_VIOLATION();

					rv->pairingId = duty->getPairingId();
					rv->dutySequenceNumber = duty->getDutySegNum();
					rv->idRule = singleRule.idRule;
					rv->ruleParamId = singleRule.idRuleParam;
					rv->startDTUtc = duty->getStartTimeUtcAct();
					rv->endDTUtc = duty->getEndTimeUtcAct();
					rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
					if (roster){
						rv->crewId = roster->idcrew;
						rv->rosterId = roster->rosterId;
						rv->type = VIOLATION_TYPE::CREW_VIOLATION;
					}
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("ruleId", "3107.1"));
					rv->operation_result.insert(pair<string, string>("fdp", Utility::GetInstancePtr()->formatMinutes(fdp / 60)));
					rv->operation_result.insert(pair<string, string>("max_extension_fdp", Utility::GetInstancePtr()->formatMinutes(lMaxFDP + iMaxExtension / 60)));
					rv->operation_result.insert(pair<string, string>("complement", complement));
					rv->operation_result.insert(pair<string, string>("checkin_lower", checkin_lower));
					rv->operation_result.insert(pair<string, string>("checkin_upper", checkin_upper));
					rv->violation_msg = errorMsg;
					this->addRuleViolations(rv, &singleRule);
					return false;
				}
				else if (fdp > (lMaxFDP + fdpDiscretion + extensionULRFDP) * 60 && fdp <= (lMaxFDP + fdpDiscretion + extensionULRFDP) * 60 + iMaxExtension && iMaxExtension != 0){
					string errorMsg = "Flight duty period ({0:fdp}) is more than the limitation ({1:MaxFDP}) but less than the extension limitation ({2:MaxExt}), \
						Crew Complement={3:complement}, Reported Time ({4:checkin_lower}-{5:checkin_upper}).";
					errorMsg = StringUtils::Format(errorMsg, Utility::GetInstancePtr()->formatMinutes(fdp / 60),
						Utility::GetInstancePtr()->formatMinutes(lMaxFDP),
						Utility::GetInstancePtr()->formatMinutes(lMaxFDP + iMaxExtension / 60),
						complement, checkin_lower, checkin_upper);

					duty->setViolationMessage(errorMsg);
					duty->setLegality(false);
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->pairingId = duty->getPairingId();
					rv->dutySequenceNumber = duty->getDutySegNum();
					rv->idRule = singleRule.idRule;
					rv->ruleParamId = singleRule.idRuleParam;
					rv->startDTUtc = duty->getStartTimeUtcAct();
					rv->endDTUtc = duty->getEndTimeUtcAct();
					rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
					if (roster){
						rv->crewId = roster->idcrew;
						rv->rosterId = roster->rosterId;
						rv->type = VIOLATION_TYPE::CREW_VIOLATION;
					}
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("ruleId", "3107.2"));
					rv->operation_result.insert(pair<string, string>("fdp", Utility::GetInstancePtr()->formatMinutes(fdp / 60)));
					rv->operation_result.insert(pair<string, string>("max_fdp", Utility::GetInstancePtr()->formatMinutes(lMaxFDP)));
					rv->operation_result.insert(pair<string, string>("max_extension_fdp", Utility::GetInstancePtr()->formatMinutes(lMaxFDP + iMaxExtension / 60)));
					rv->operation_result.insert(pair<string, string>("complement", complement));
					rv->operation_result.insert(pair<string, string>("checkin_lower", checkin_lower));
					rv->operation_result.insert(pair<string, string>("checkin_upper", checkin_upper));
					rv->violation_msg = errorMsg;
					this->addRuleViolations(rv, &singleRule);
					return false;
				}
				else if (fdp > (lMaxFDP + fdpDiscretion + extensionULRFDP) * 60){
					string errorMsg = "Flight duty period ({0:fdp}) is more than the limitation ({1:MaxFDP}), Crew Complement={2:complement}, Reported Time ({3:checkin_lower}-{4:checkin_upper}).";
					errorMsg = StringUtils::Format(errorMsg, Utility::GetInstancePtr()->formatMinutes(fdp / 60),
						Utility::GetInstancePtr()->formatMinutes(lMaxFDP),
						complement, checkin_lower, checkin_upper);

					duty->setViolationMessage(errorMsg);
					duty->setLegality(false);
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->pairingId = duty->getPairingId();
					rv->dutySequenceNumber = duty->getDutySegNum();
					rv->idRule = singleRule.idRule;
					rv->ruleParamId = singleRule.idRuleParam;
					rv->startDTUtc = duty->getStartTimeUtcAct();
					rv->endDTUtc = duty->getEndTimeUtcAct();
					rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
					if (roster){
						rv->crewId = roster->idcrew;
						rv->rosterId = roster->rosterId;
						rv->type = VIOLATION_TYPE::CREW_VIOLATION;
					}
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("ruleId", "3107.3"));
					rv->operation_result.insert(pair<string, string>("fdp", Utility::GetInstancePtr()->formatMinutes(fdp / 60)));
					rv->operation_result.insert(pair<string, string>("max_fdp", Utility::GetInstancePtr()->formatMinutes(lMaxFDP)));
					rv->operation_result.insert(pair<string, string>("complement", complement));
					rv->operation_result.insert(pair<string, string>("checkin_lower", checkin_lower));
					rv->operation_result.insert(pair<string, string>("checkin_upper", checkin_upper));
					rv->violation_msg = errorMsg;
					this->addRuleViolations(rv, &singleRule);
					return false;
				}
				return true;
			}
		}
	}
	return true;
}


bool LegalityChecker::checkFDPPerDuty_Roster_remind(RULE_LEGALITY * pPairing)
{
	bool isValid = true;
	if (this->GetApplication() != ROSTER_EDITOR || pPairing->crewIndex < 0)
	{
		return true;
	}
	vector<SharedPtr<ROSTER>>& rosterList = this->_dbData->crewList[pPairing->crewIndex]->rosterList;
	for (auto roster : rosterList){
		Pairing* p = (*roster).pairing;
		if (!p)continue;
		for (size_t j = 0; j < p->getDutyVec().size(); j++){

			Duty* duty = (p->getDutyVec())[j];

			Duty::DUTY_TYPE dtType = duty->getType();
			if (dtType == Duty::DUTY_PAIRING_REST || dtType == Duty::DUTY_BLANK_DAY){
				continue;
			}
			bool bLegal = true;

			if (this->GetApplication() == ROSTER_EDITOR && pPairing->crewIndex >= 0){
				bLegal = this->checkFDPPerDutyByDuty_remind(duty, roster);
			}
			else{
				bLegal = this->checkFDPPerDutyByDuty_remind(duty);
			}

		}
	}

	return isValid;
}