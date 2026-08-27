#include "RuleEngine.h"
#include "Utility.h"

#include <ctime>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
#include "utils/TimeUtils.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"

bool LegalityChecker::checkBlockPerDutyByDuty(Duty * duty, SharedPtr<ROSTER> roster)
{
	
	DBG_HELP("LegalityChecker::checkBlockPerDutyByDuty");
	if (!checkDutyIsNoOperating(duty)){
		return true;
	}
	const vector<DBRule>& rules = this->_dbData->getRuleFunctions(RULES::MAX_BLOCK_PERDUTY);
	bool matchedAnyRule = false;
	bool passedAllRules = true;
	for (auto& singleRule:rules){

		if (RosterUtils::ExistExceptionCode(roster.get(), duty, singleRule.exceptionCodes, this->_dbData)) {
			continue;
		}

		const map<string, string>& parameter = singleRule.params;

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
			//string tailNumber = segment->getRegister(); // tailNum -> Register
			//int ii = 0;
			//if (this->_dbData->fltIdToAircraftMap.find(tailNumber) != this->_dbData->fltIdToAircraftMap.end()){
			//	DBAircraft* aircraft = this->_dbData->fltIdToAircraftMap[tailNumber].get();
			//	if (aircraft->restFacility > 0){
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

		time_t checkinLocal = duty->getStartTimeLocAct();
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

		bool bIsBunk = true;

		//minutes
		long blk = duty->getActualBlockTime();

		time_t depTimeLocal = duty->getFirstSegment()->getStartTimeLocAct();
		bool departureInRange = TimeUtils::IsTimesInRange(depTimeLocal, TimeUtils::hhmmToMinutes(departure_start), TimeUtils::hhmmToMinutes(departure_end));
		bool isInRange = TimeUtils::IsTimesInRange(checkinLocal, TimeUtils::hhmmToMinutes(checkin_lower), TimeUtils::hhmmToMinutes(checkin_upper));
		bool dutyType = true;
		if (duty_type != "*")
			dutyType = DutyUtils::getDutyType(duty) == duty_type;

		int extensionULRBLH = 0;
		// EVA
		if (extension_ts_flags != "*" && extension_ts_flags != "" && roster) {
			const auto& crew = this->_dbData->crewIdMap[roster->idcrew];
			string crewbase = crew->getPrimeBase();
			for (const auto& seg : duty->getSegments()) {
				const auto& rf = this->_dbData->rosterFlightMgr.get(seg->getDBId(), crew->idCrew);
				if (rf && find(extension_ts_flag_list.begin(), extension_ts_flag_list.end(), rf->tsFlag) != extension_ts_flag_list.end()) {
					duty->clearLimitation(RULE_LIMITATION_TYPE::MAX_BLOCK);
					extensionULRBLH = BLHExtension;
				}
			}
			
		}

		//if (isInRange && (landing<iLandingUpper && landing >= iLandingLow) && (strComplement==complement) ) {
		if (isInRange && departureInRange && dutyType && matchSchBLH && (complement == "*"|| find(compositions.begin(), compositions.end(), compName) != compositions.end()))
		{
			matchedAnyRule = true;
			int ftDiscretion = 0;
			if (duty->supportDiscretionType(DiscretionType::FT)) {
				ftDiscretion = duty->getManualFtDiscretion();
			}
			if (blk > lMaxBlock + extensionULRBLH + ftDiscretion)
			{
				if (this->_application == PAIRING_OPTIMIZER)
					return false;
				string errorMsg = "Block time ({0:blktime}) is more than the limitation ({1:max_blh} + {2:blh_discretion}), Crew Complement={3:complement}, Reported Time ({4:checkin_lower}-{5:checkin_upper}), Actual Repoert Time ({6:actCheckin}), Departure Time ({7:dep_lower}-{8:dep_upper}), Actual Departure Time ({9:actDep}).";
				errorMsg = StringUtils::Format(errorMsg, Utility::GetInstancePtr()->formatMinutes(blk + extensionULRBLH), 
					max_blh, Utility::GetInstancePtr()->formatMinutes(ftDiscretion), complement, checkin_lower, checkin_upper, TimeUtils::Format(checkinLocal), departure_start, departure_end, TimeUtils::Format(depTimeLocal));

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
				rv->operation_result.insert(pair<string, string>("departure_start", departure_start));
				rv->operation_result.insert(pair<string, string>("departure_end", departure_end));
				rv->operation_result.insert(pair<string, string>("act_checkin_time", TimeUtils::Format(checkinLocal)));
				rv->operation_result.insert(pair<string, string>("departure_time", TimeUtils::Format(depTimeLocal)));
				rv->violation_msg = errorMsg;
				this->addRuleViolations(rv, &singleRule);
				duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_BLOCK, lMaxBlock + extensionULRBLH, singleRule.idRule, singleRule.idRuleParam, singleRule.overridebility, singleRule.classType, singleRule.description, singleRule.reference);
				passedAllRules = false;
				//return false;
			}
			duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_BLOCK, lMaxBlock + extensionULRBLH, singleRule.idRule, singleRule.idRuleParam, singleRule.overridebility, singleRule.classType, singleRule.description, singleRule.reference);
			//return true;
		}
	}
	if (!matchedAnyRule) return false;
	return passedAllRules;
}
//3008判断休息区老逻辑
//bool hasBunk = false;

//for (auto& segment : segments)
//{
//	string fleet = segment->getFleetCD();
//	int i = 0;
//	i = resBunks[fleet];
//	if ((i >= 0) && (hasBunk || segments.size() == 1))
//	{
//		hasBunk = true;
//	}
//	else
//		hasBunk = false;
//}		
//if (bunk != "*")
//{
//	if (bunk == "Y" && !hasBunk)
//		continue;
//	if (bunk == "N" && hasBunk)
//		continue;
//}
bool LegalityChecker::getIsAugment_3008(Duty * duty){
	//RULE_COMPOSITION* composition = new RULE_COMPOSITION();//20190418 ain, mantis#5183, clear mem leak

	time_t checkinLocal = duty->getStartTimeLocAct();
	int landing = duty->getNumFlySegs();

	//COMPOSITION,RPT START,RPT END,MAX BLH
	//2P,00:00,04:58,08:00

	string header, headeValue;
	string complement, max_blh = "9999", checkin_lower = "00:00", checkin_upper = "23:59", departure_start = "00:00", departure_end = "23:59", duty_type = "*";
	bool isAugment = false;
	vector<string> compositions;
	//1	COMPOSITION, RPT START, RPT END, MAX BLH
	//DEFINITION,VALUE
	//USEHISTORICALBLH,Y
	string strDefinition, strValue = "N";
	vector<RULE_COMPOSITION>* rule_compositon = this->getCompositionDefinition();

	const vector<DBRule>& rules = this->_dbData->getRuleFunctions(RULES::MAX_BLOCK_PERDUTY);
	map<string, string>::const_iterator iter;

	for (size_t iRule = 0; iRule < rules.size(); iRule++)
	{
		DBRule singleRule = rules[iRule];
		if (singleRule.tableNum > 1)
			continue;
		map<string, string> parameter = singleRule.params;

		for (iter = parameter.begin(); iter != parameter.end(); iter++)
		{
			header = iter->first;
			headeValue = iter->second;

			if (header == "DEFINITION") {
				strDefinition = headeValue;
			}
			if (header == "VALUE") {
				strValue = headeValue;
			}
		}
		break;
	}

	vector<Segment *> segments = duty->getSegments();
	long block = 0;
	for (auto & segment : segments)
	{
		if ((strDefinition == "USEHISTORICALBLH") && (strValue == "Y"))
		{
			segment->setHistoricalBlhFlag(true);
		}
		block += segment->getBlkMinutes();
	}

	for (vector<RULE_COMPOSITION>::iterator it = rule_compositon->begin(); it != rule_compositon->end(); ++it)
	{
		/*if (this->_application == PAIRING_OPTIMIZER && !RuleParams::GetInstancePtr()->canAugmented)
		{
			if ((*it).name != RuleParams::GetInstancePtr()->basicComposition)
				continue;
		}*/

		for (size_t iRule = 0; iRule < rules.size(); iRule++)
		{
			if (rules[iRule].tableNum == 1)
				continue;

			map<string, string> parameter = rules[iRule].params;
			for (iter = parameter.begin(); iter != parameter.end(); ++iter)
			{
				header = iter->first;
				headeValue = iter->second;

				if (header == "COMPOSITION") {
					complement = headeValue;
					split(complement, '|', compositions);
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
			}

			if (this->_application == PAIRING_OPTIMIZER && !RuleParams::GetInstancePtr()->canAugmented)
			{
				if (isAugment)
					continue;
			}

			if (find(compositions.begin(), compositions.end(), (*it).name) == compositions.end())
				continue;

			auto checkin_lower_minutes = TimeUtils::hhmmToMinutes(checkin_lower);
			auto checkin_upper_minutes = TimeUtils::hhmmToMinutes(checkin_upper);
			bool isInRange = TimeUtils::IsTimesInRange(checkinLocal, checkin_lower_minutes, checkin_upper_minutes);


			time_t depTimeLocal = duty->getFirstSegment()->getStartTimeLocAct();
			bool departureInRange = TimeUtils::IsTimesInRange(depTimeLocal, TimeUtils::hhmmToMinutes(departure_start), TimeUtils::hhmmToMinutes(departure_end));
			if (!isInRange || !departureInRange)
				continue;

			bool dutyType = true;
			if (duty_type != "*" && duty->getFirstSegment()->getDomIntType() == duty_type)
				continue;

			long lMaxBlock = hhmmToMinutes(max_blh.c_str());

			if (block > lMaxBlock)
				continue;

			return isAugment;
		}
	}

	return isAugment; //不会执行这一句，因为留下的duty都是合法的
};