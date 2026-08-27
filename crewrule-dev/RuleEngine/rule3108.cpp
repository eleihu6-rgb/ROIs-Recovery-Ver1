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
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"

bool LegalityChecker::checkBlockPerDutyByDuty_remind(Duty * duty, SharedPtr<ROSTER> roster)
{
	DBG_HELP("LegalityChecker::checkBlockPerDutyByDuty_remind");	
	if (!checkDutyIsNoOperating(duty)){
		return true;
	}
	auto& rules = this->_dbData->getRuleFunctions(RULES::REMIND_MAX_BLOCK_PERDUTY);
	for (auto& singleRule : rules){

		if (RosterUtils::ExistExceptionCode(roster.get(), duty, singleRule.exceptionCodes, this->_dbData)) {
			continue;
		}

		auto& parameter = singleRule.params;

		map<string, string>::const_iterator iter;

		string header, headeValue;
		bool isAugment = false;
		string complement, bunk = "*", landing_lower = "0", landing_upper = "99", max_blh = "9999", checkin_lower = "00:00", checkin_upper = "23:59", departure_start = "00:00", departure_end = "23:59", duty_type = "*",
			extension_ts_flags = "*", blh_extension = "00:00", leg_sch_blh_start = "*", leg_sch_blh_end = "*";
		vector<string> compositions;
		vector<string> extension_ts_flag_list;
		int RestFacility = 0;
		int BLHExtension = 0;
		int legSchBLHStart = 0;
		int legSchBLHEnd = 0;
		//1	COMPOSITION, RPT START, RPT END, MAX BLH
		//DEFINITION,VALUE
		//USEHISTORICALBLH,Y
		string strDefinition, strValue;
		for (iter = parameter.begin(); iter != parameter.end(); iter++)
		{
			header = iter->first;
			headeValue = iter->second;

			//transform(header.begin(), header.end(), header.begin(), ::toupper);
			//transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);
			if (_debug)
				cout << "Header=" << header << ":value=" << headeValue << endl;
			if (header == "COMPOSITION") {
				complement = headeValue;
				split(complement, '|', compositions);
			}
			if (header == "WITH_BUNK") {
				bunk = headeValue;
			}
			if (header == "REST FACILITY") {
				bunk = headeValue;
				if (bunk != "" &&bunk != "*"){
					RestFacility = atoi(bunk.c_str());
				}
			}
			if (header == "LANDING_TIMES_LOWER") {
				landing_lower = headeValue;
			}
			if (header == "LANDING_TIMES_UPPER") {
				landing_upper = headeValue;
			}
			if (header == "RPT START") {
				checkin_lower = headeValue;
			}
			if (header == "RPT END") {
				checkin_upper = headeValue;
			}
			if (header == "MAX BLH") {
				max_blh = headeValue;
			}
			if (header == "DEFINITION") {
				strDefinition = headeValue;
			}
			if (header == "VALUE") {
				strValue = headeValue;
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
			if (header == "EXTENSION TS FLAGS") {
				extension_ts_flags = headeValue;
				split(headeValue, '|', extension_ts_flag_list);
			}
			if (header == "BLH EXTENSION") {
				blh_extension = headeValue;
				BLHExtension = TimeUtils::hhmmToMinutes(blh_extension);
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
		transform(strDefinition.begin(), strDefinition.end(), strDefinition.begin(), ::toupper);
		if ((strDefinition == "USEHISTORICALBLH") && (strValue == "Y"))
		{
			vector<Segment *> seglist = duty->getSegments();
			for (vector<Segment *>::iterator iter = seglist.begin(); iter != seglist.end(); iter++){
				(*iter)->setHistoricalBlhFlag(true);
			}
			continue;
		}

		if (_application == PAIRING_OPTIMIZER && (!RuleParams::GetInstancePtr()->canAugmented)){
			if (isAugment)
				continue;
		}

		map<string, int>& resBunks = RuleParams::GetInstancePtr()->rest_bunk;
		vector<Segment*> segments = duty->getSegments();
		//3008判断休息区新逻辑
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
		int iLandingLow = 0, iLandingUpper = 999, lMaxBlock = 9999;
		iLandingLow = stoi(landing_lower);
		iLandingUpper = stoi(landing_upper);
		//lMaxBlock 分钟 12:01
		lMaxBlock = stoi(max_blh.substr(0, max_blh.find(":"))) * 60 + stoi(max_blh.substr(max_blh.find(":") + 1));

		duty->calculateDutyValues(this->_application);

		time_t checkinLocal = duty->getStartTimeUtcAct();
		//checkin = Utility::GetInstance().getLocalTime(checkin,duty->getDepStation());

		int landing = duty->getNumFlySegs();

		if (!(landing >= iLandingLow && landing <= iLandingUpper))
			continue;

		//map<string, int> mapComplement = duty->getComplementMap();
		//string strComplement = Utility::GetInstancePtr()->getComplement(mapComplement);

		string compName = duty->getCompositionName();
		if (compName == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
		{
			compName = this->getCompositionByDuty(duty);
			//compName = this->pairingCompositionCalculator->calculatePairingCompositionForPilotR5_3008(duty);
			duty->setCompositionName(compName);
		}

		string strBase = duty->getDepStation();
		bool bIsBunk = true;
		//auto offsetMinutes = _dbData->getAirportOffsetMinutes(strBase);

		//minutes
		long blk = duty->getActualBlockTime();

		time_t depTimeLocal = duty->getFirstSegment()->getStartTimeLocAct();
		bool departureInRange = TimeUtils::IsTimesInRange(depTimeLocal, TimeUtils::hhmmToMinutes(departure_start), TimeUtils::hhmmToMinutes(departure_end));
		bool dutyType = true;
		if (duty_type != "*")
			dutyType = DutyUtils::getDutyType(duty) == duty_type;

		int extensionULRBLH = 0;
		// EVA
		if (extension_ts_flags != "*" && extension_ts_flags != "" && roster) {
			const auto& crew = this->_dbData->crewIdMap[roster->idcrew];
			string crewbase = crew->getPrimeBase();
			for (const auto& rf : this->_dbData->rosterFlightMgr.getByPairingId(roster->pairId)) {
				if (rf->dutyId == duty->getDutyId() && rf->crewId == crew->idCrew && find(extension_ts_flag_list.begin(), extension_ts_flag_list.end(), rf->tsFlag) != extension_ts_flag_list.end()) {
					extensionULRBLH = BLHExtension;
				}

			}
		}

		//bool isInRange = Utility::GetInstancePtr()->IsTimesInRange(checkin, offsetMinutes, checkin_lower, checkin_upper);
		auto checkin_lower_minutes = TimeUtils::hhmmToMinutes(checkin_lower);
		auto checkin_upper_minutes = TimeUtils::hhmmToMinutes(checkin_upper);
		bool isInRange = TimeUtils::IsTimesInRange(checkinLocal, checkin_lower_minutes, checkin_upper_minutes);

		//if (isInRange && (landing<iLandingUpper && landing >= iLandingLow) && (strComplement==complement) ) {
		if (isInRange && departureInRange && dutyType && matchSchBLH && (complement == "*" || find(compositions.begin(), compositions.end(), compName) != compositions.end()))
		{
			if (blk > lMaxBlock)
			{
				string errorMsg = "Block hours ({0:blkMinutes}) are more than the limitation ({1:max_blh}), Crew Complement={2:complement}, Reported Time ({3:checkin_lower}-{4:checkin_upper}).";
				errorMsg = StringUtils::Format(errorMsg, Utility::GetInstancePtr()->formatMinutes(blk),
					max_blh, complement, checkin_lower, checkin_upper);

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
				rv->operation_result.insert(pair<string, string>("blk", Utility::GetInstancePtr()->formatMinutes(blk)));
				rv->operation_result.insert(pair<string, string>("max_blh", max_blh));
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
	return true;
}

bool LegalityChecker::checkBlockPerDuty_Roster_remind(RULE_LEGALITY * pPairing)
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
			if ((dtType != Duty::DUTY_PURE_OPR) && (dtType != Duty::DUTY_FLY))
				continue;
			bool bLegal = true;

			if (this->GetApplication() == ROSTER_EDITOR && pPairing->crewIndex >= 0){
				bLegal = this->checkBlockPerDutyByDuty_remind(duty, roster);
			}
			else{
				bLegal = this->checkBlockPerDutyByDuty_remind(duty);
			}
		}
	}
	return isValid;
}