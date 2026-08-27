#include "RuleEngine.h"
#include "Utility.h"

#include <ctime>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
#include "RuleParams.h"
#include "UtilDbg.h"
#include "utils/TimeUtils.h"
#include "StringUtil.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/PhaseUtils.h"
#include "Log/Logger.h"

static int getLangdingNums(Duty* duty, CrewDataContext* dbData);

bool LegalityChecker::checkFDPPerDuty_Roster(RULE_LEGALITY* pPairing)
{
	bool isValid = true;
	if (this->GetApplication() != ROSTER_EDITOR || pPairing->crewIndex < 0)
	{
		return true;
	}
	vector<SharedPtr<ROSTER>>& rosterList = this->_dbData->crewList[pPairing->crewIndex]->rosterList;
	for (auto& roster : rosterList) {
		Pairing* p = (*roster).pairing;
		if (!p)continue;
		for (size_t j = 0; j < p->getDutyVec().size(); j++) {

			Duty* duty = (p->getDutyVec())[j];

			Duty::DUTY_TYPE dtType = duty->getType();
			if (dtType == Duty::DUTY_PAIRING_REST || dtType == Duty::DUTY_BLANK_DAY) {
				continue;
			}
			bool bLegal = true;

			if (this->GetApplication() == ROSTER_EDITOR && pPairing->crewIndex >= 0) {
				bLegal = this->checkFDPPerDutyByDuty(duty, roster);
			}
			else {
				bLegal = this->checkFDPPerDutyByDuty(duty);
			}

		}
	}

	return isValid;
}

bool LegalityChecker::checkFDPPerDutyByDuty(Duty * duty, SharedPtr<ROSTER> roster){
	if (_dbData->scenario.airline == "TG") {
		//TG使用setFDPPerDutyByDuty()方法，仅设置MaxFDP不做检查
		return true;
	}
	DBG_HELP("LegalityChecker::checkFDPPerDutyByDuty");

	if (!checkDutyIsNoOperating(duty)){
		return true;
	}
	vector<DBRule> rules = this->_dbData->getRuleFunctions(RULES::MAX_FDP_PERDUTY);
	for (auto& singleRule : rules){

		if (duty != nullptr && !PhaseUtils::IsChecked(duty, singleRule.phase, this->_dbData)) {
			continue;
		}

		if (RosterUtils::ExistExceptionCode(roster.get(), duty, singleRule.exceptionCodes, this->_dbData)) {
			continue;
		}

		if (roster != nullptr && !PhaseUtils::IsChecked(roster.get(), singleRule.phase, this->_dbData)) {
			continue;
		}

		if (duty != nullptr && !PhaseUtils::IsChecked(duty, singleRule.phase, this->_dbData)) {
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
		int cut = 0;
		int ltRestThreadhold = 0;
		int atBaseFDPExtension = 0;
		int outOfBaseFDPExtension = 0;
		double ltRestRatio = 0.0;
		int legSchBLHStart = 0;
		int legSchBLHEnd = 0;
		for (iter = parameter.begin(); iter != parameter.end(); iter++)
		{
			cut++;
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
				if (!headeValue.empty() && headeValue != "*") {
					ltRestThreadhold = TimeUtils::hhmmToMinutes(headeValue);
				}
			}
			if (header == "LT REST RATIO") {
				if (!headeValue.empty() && headeValue != "*") {
					ltRestRatio = atof(headeValue.c_str());
				}
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
				//if (this->_dbData->subFleetMap.find(segment->getSubFleet()) != this->_dbData->subFleetMap.end()) {
				//	SUB_FLEET subFleet = this->_dbData->subFleetMap[segment->getSubFleet()];
				//	if (subFleet.restFacility > ii) {
				//		ii = subFleet.restFacility;
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
			int landing = getLangdingNums(duty, _dbData.get());
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
			bool bIsBunk = true;

			time_t depTimeLocal = duty->getFirstSegment()->getStartTimeLocAct();
			bool isInRange = TimeUtils::IsTimesInRange(checkinLocal, TimeUtils::hhmmToMinutes(checkin_lower), TimeUtils::hhmmToMinutes(checkin_upper));
			bool departureInRange = TimeUtils::IsTimesInRange(depTimeLocal, TimeUtils::hhmmToMinutes(departure_start), TimeUtils::hhmmToMinutes(departure_end));

			bool dutyType = true;
			if (duty_type != "*")
				dutyType = DutyUtils::getDutyType(duty) == duty_type;

			bool dutyFleet = true;
			if (duty_fleet_str != "*") {
				const auto & seg = duty->getFirstFlySegment();
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
						auto currentSeg = duty->getSegments()[i];
						auto nextSeg = duty->getSegments()[i + 1];
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
			auto discretionTypes = duty->getDiscretionTypes();
			if (!discretionTypes.empty() && !discretionTypes[0].empty() && find(discretionTypes.begin(), discretionTypes.end(), "FDP") != discretionTypes.end()) {
				fdpDiscretion = duty->getFdpDiscretion();
			}
			int extensionULRFDP = 0;
			// EVA
			if (extension_ts_flags != "*" && extension_ts_flags != "" && roster) {
				const auto& crew = this->_dbData->crewIdMap[roster->idcrew];
				string crewbase = crew->getPrimeBase();
				for (const auto & rf : this->_dbData->rosterFlightMgr.getByPairingId(roster->pairId)) {
					if (rf->dutyId == duty->getDutyId() && rf->crewId == crew->idCrew && find(extension_ts_flag_list.begin(), extension_ts_flag_list.end(), rf->tsFlag) != extension_ts_flag_list.end()) {
						auto iterFlt = this->_dbData->flightIdMap.find(rf->fltId);
						if (iterFlt != this->_dbData->flightIdMap.end() && iterFlt->second->getDepStation() == crewbase)
							extensionULRFDP = atBaseFDPExtension;
						else {
							extensionULRFDP = outOfBaseFDPExtension;
						}
					}
				
				}
			}

			if (isInRange && departureInRange && dutyType && dutyFleet && matchSchBLH && (landing <= iLandingUpper && landing >= iLandingLow) && (strComplement == "" || complement == "*" || find(compositions.begin(), compositions.end(), strComplement) != compositions.end())) {
				if (fdp > (lMaxFDP + fdpDiscretion + extensionULRFDP) * 60 + iMaxExtension && iMaxExtension != 0){
					if (this->_application == PAIRING_OPTIMIZER)
						return false;
					string errorMsg = "Flight duty period ({0:fdp}) is more than the extension limitation ({1:MaxFDP}), \
						Crew Complement={2:complement}, Reported Time ({3:checkin_lower}-{4:checkin_upper}), Actual Repoert Time ({5:actCheckin}), Departure Time ({6:dep_lower}-{7:dep_upper}), Actual Departure Time ({8:actDep}).";
					errorMsg = StringUtils::Format(errorMsg, Utility::GetInstancePtr()->formatMinutes(fdp / 60),
						Utility::GetInstancePtr()->formatMinutes(lMaxFDP + iMaxExtension / 60 + extensionULRFDP) + (fdpDiscretion > 0 ? (" + " + Utility::GetInstancePtr()->formatMinutes(fdpDiscretion)) : ""),
						complement,
						checkin_lower, checkin_upper, TimeUtils::Format(checkinLocal), departure_start, departure_end, TimeUtils::Format(depTimeLocal));

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
					rv->operation_result.insert(pair<string, string>("ruleId", "3007.1"));
					rv->operation_result.insert(pair<string, string>("fdp", Utility::GetInstancePtr()->formatMinutes(fdp / 60)));
					rv->operation_result.insert(pair<string, string>("max_extension_fdp", Utility::GetInstancePtr()->formatMinutes(lMaxFDP + iMaxExtension / 60 + extensionULRFDP)));
					rv->operation_result.insert(pair<string, string>("fdp_discretion", Utility::GetInstancePtr()->formatMinutes(fdpDiscretion)));
					rv->operation_result.insert(pair<string, string>("complement", complement));
					rv->operation_result.insert(pair<string, string>("checkin_lower", checkin_lower));
					rv->operation_result.insert(pair<string, string>("checkin_upper", checkin_upper));
					rv->operation_result.insert(pair<string, string>("departure_start", departure_start));
					rv->operation_result.insert(pair<string, string>("departure_end", departure_end));
					rv->operation_result.insert(pair<string, string>("act_checkin_time", TimeUtils::Format(checkinLocal)));
					rv->operation_result.insert(pair<string, string>("departure_time", TimeUtils::Format(depTimeLocal)));
					rv->violation_msg = errorMsg;
					this->addRuleViolations(rv, &singleRule);
					duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, lMaxFDP, singleRule.idRule, singleRule.idRuleParam, singleRule.overridebility, singleRule.classType, singleRule.description, singleRule.reference);
					return false;
				}
				else if (fdp > (lMaxFDP + fdpDiscretion + extensionULRFDP) * 60 && fdp <= (lMaxFDP + fdpDiscretion + extensionULRFDP) * 60 + iMaxExtension && iMaxExtension != 0){
					if (this->_application == PAIRING_OPTIMIZER)
						return false;
					string errorMsg = "Flight duty period ({0:fdp}) is more than the limitation ({1:MaxFDP}) but less than the extension limitation ({2:MaxExt}), \
						Crew Complement={3:complement}, Reported Time ({4:checkin_lower}-{5:checkin_upper}), Actual Repoert Time ({5:actCheckin}), Departure Time ({6:dep_lower}-{7:dep_upper}), Actual Departure Time ({8:actDep}).";
					errorMsg = StringUtils::Format(errorMsg, Utility::GetInstancePtr()->formatMinutes(fdp / 60),
						Utility::GetInstancePtr()->formatMinutes(lMaxFDP),
						Utility::GetInstancePtr()->formatMinutes(lMaxFDP + iMaxExtension / 60 + extensionULRFDP) + (fdpDiscretion > 0 ? (" + " + Utility::GetInstancePtr()->formatMinutes(fdpDiscretion)) : ""),
						complement,
						checkin_lower, checkin_upper, TimeUtils::Format(checkinLocal), departure_start, departure_end, TimeUtils::Format(depTimeLocal));

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
					rv->operation_result.insert(pair<string, string>("ruleId", "3007.2"));
					rv->operation_result.insert(pair<string, string>("fdp", Utility::GetInstancePtr()->formatMinutes(fdp / 60)));
					rv->operation_result.insert(pair<string, string>("max_fdp", Utility::GetInstancePtr()->formatMinutes(lMaxFDP)));
					rv->operation_result.insert(pair<string, string>("max_extension_fdp", Utility::GetInstancePtr()->formatMinutes(lMaxFDP + iMaxExtension / 60 + extensionULRFDP)));
					rv->operation_result.insert(pair<string, string>("fdp_discretion", Utility::GetInstancePtr()->formatMinutes(fdpDiscretion)));
					rv->operation_result.insert(pair<string, string>("complement", complement));
					rv->operation_result.insert(pair<string, string>("checkin_lower", checkin_lower));
					rv->operation_result.insert(pair<string, string>("checkin_upper", checkin_upper));
					rv->operation_result.insert(pair<string, string>("departure_start", departure_start));
					rv->operation_result.insert(pair<string, string>("departure_end", departure_end));
					rv->operation_result.insert(pair<string, string>("act_checkin_time", TimeUtils::Format(checkinLocal)));
					rv->operation_result.insert(pair<string, string>("departure_time", TimeUtils::Format(depTimeLocal)));
					rv->violation_msg = errorMsg;
					this->addRuleViolations(rv, &singleRule);
					duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, lMaxFDP, singleRule.idRule, singleRule.idRuleParam, singleRule.overridebility, singleRule.classType, singleRule.description, singleRule.reference);
					return false;
				}
				else if (fdp > (lMaxFDP + fdpDiscretion + extensionULRFDP) * 60){
					if (this->_application == PAIRING_OPTIMIZER)
						return false;
					string errorMsg = "Flight duty period ({0:fdp}) is more than the limitation ({1:MaxFDP}), Crew Complement={2:complement}, Reported Time ({3:checkin_lower}-{4:checkin_upper}), Actual Repoert Time ({5:actCheckin}), Departure Time ({6:dep_lower}-{7:dep_upper}), Actual Departure Time ({8:actDep}).";
					errorMsg = StringUtils::Format(errorMsg, Utility::GetInstancePtr()->formatMinutes(fdp / 60),
						Utility::GetInstancePtr()->formatMinutes(lMaxFDP + extensionULRFDP) + (fdpDiscretion > 0 ? (" + " + Utility::GetInstancePtr()->formatMinutes(fdpDiscretion)) : ""),
						complement,
						checkin_lower, checkin_upper, TimeUtils::Format(checkinLocal), departure_start, departure_end, TimeUtils::Format(depTimeLocal));

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
					rv->operation_result.insert(pair<string, string>("ruleId", "3007.3"));
					rv->operation_result.insert(pair<string, string>("fdp", Utility::GetInstancePtr()->formatMinutes(fdp / 60)));
					rv->operation_result.insert(pair<string, string>("max_fdp", Utility::GetInstancePtr()->formatMinutes(lMaxFDP + extensionULRFDP)));
					rv->operation_result.insert(pair<string, string>("fdp_discretion", Utility::GetInstancePtr()->formatMinutes(fdpDiscretion)));
					rv->operation_result.insert(pair<string, string>("complement", complement));
					rv->operation_result.insert(pair<string, string>("checkin_lower", checkin_lower));
					rv->operation_result.insert(pair<string, string>("checkin_upper", checkin_upper));
					rv->operation_result.insert(pair<string, string>("departure_start", departure_start));
					rv->operation_result.insert(pair<string, string>("departure_end", departure_end));
					rv->operation_result.insert(pair<string, string>("act_checkin_time", TimeUtils::Format(checkinLocal)));
					rv->operation_result.insert(pair<string, string>("departure_time", TimeUtils::Format(depTimeLocal)));
					rv->violation_msg = errorMsg;
					this->addRuleViolations(rv, &singleRule);
					duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, lMaxFDP, singleRule.idRule, singleRule.idRuleParam, singleRule.overridebility, singleRule.classType, singleRule.description, singleRule.reference);
					return false;
				}
				duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, lMaxFDP, singleRule.idRule, singleRule.idRuleParam, singleRule.overridebility, singleRule.classType, singleRule.description, singleRule.reference);
				return true;
			}
		}
	}
	return false; //如果没有任何一条规则能够符合duty属性,认为是违规
}

void LegalityChecker::setFDPPerDutyByDuty(Duty* duty, SharedPtr<ROSTER> roster) {
	DBG_HELP("LegalityChecker::setFDPPerDutyByDuty");

	if (!checkDutyIsNoOperating(duty)) {
		return;
	}

	//航班延误处理
	bool isStdOnFlightDelay = isUsedStdOnFlightDelay(duty);

	auto& rules = this->_dbData->getRuleFunctions(RULES::MAX_FDP_PERDUTY);
	for (auto& singleRule : rules) {
		auto& parameter = singleRule.params;

		if (roster != nullptr && !PhaseUtils::IsChecked(roster.get(), singleRule.phase, this->_dbData)) {
			continue;
		}

		if (duty != nullptr && !PhaseUtils::IsChecked(duty, singleRule.phase, this->_dbData)) {
			continue;
		}

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
		int cut = 0;
		int ltRestThreadhold = 0;
		int atBaseFDPExtension = 0;
		int outOfBaseFDPExtension = 0;
		double ltRestRatio = 0.0;
		int legSchBLHStart = 0;
		int legSchBLHEnd = 0;
		for (iter = parameter.begin(); iter != parameter.end(); iter++)
		{
			cut++;
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
				if (bunk != "" && bunk != "*") {
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
			if (header == "MAX EXTENSION") {
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
				if (!headeValue.empty() && headeValue != "*") {
					ltRestThreadhold = TimeUtils::hhmmToMinutes(headeValue);
				}
			}
			if (header == "LT REST RATIO") {
				if (!headeValue.empty() && headeValue != "*") {
					ltRestRatio = atof(headeValue.c_str());
				}
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
		if (_application == PAIRING_OPTIMIZER && (!RuleParams::GetInstancePtr()->canAugmented)) {
			if (isAugment)
				continue;
		}

		if (duty != nullptr && !PhaseUtils::IsChecked(duty, singleRule.phase, this->_dbData)) {
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
			if (roster) {
				if (roster->pairing->getFirstDuty()->getDutyId() == duty->getDutyId()) {
					if (roster->dutyValues.getMergeFdp(0) != 0) {
						fdp = roster->dutyValues.getMergeFdp(0) * 60;
					}
				}
				else if (roster->pairing->getLastDuty()->getDutyId() == duty->getDutyId()) {
					if (roster->dutyValues.getMergeFdp((int)roster->pairing->getNumDuties() - 1) != 0) {
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
				//if (this->_dbData->fltIdToAircraftMap.find(tailNumber) != this->_dbData->fltIdToAircraftMap.end()) {
				//	DBAircraft* aircraft = this->_dbData->fltIdToAircraftMap[tailNumber].get();
				//	if (aircraft->isExistRest) {
				//		ii = aircraft->restFacility;
				//	}
				//}
				//else if (this->_dbData->fleetMap.find(segment->getFleetCD()) != this->_dbData->fleetMap.end()) {
				//	FLEET fleet = this->_dbData->fleetMap[segment->getFleetCD()];
				//	if (fleet.restfacility > ii) {
				//		ii = fleet.restfacility;
				//	}
				//}
				//if (this->_dbData->subFleetMap.find(segment->getSubFleet()) != this->_dbData->subFleetMap.end()) {
				//	SUB_FLEET subFleet = this->_dbData->subFleetMap[segment->getSubFleet()];
				//	if (subFleet.restFacility > ii) {
				//		ii = subFleet.restFacility;
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
			int landing = getLangdingNums(duty, _dbData.get());
			//map<string, int> mapComplement = duty->getComplementMap();
			//string strComplement = Utility::GetInstancePtr()->getComplement(mapComplement);
			//若seg延误则fdp可以延长
			if (fdp > lMaxFDP * 60) {
				for (int i = (int)duty->getSegments().size() - 1; i < (int)duty->getSegments().size() && i > 0; i++) {
					Segment* seg = duty->getSegment(i);
					if (seg->getEndTimeUtcAct() > seg->getEndTimeUtcSch()) {
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
			bool bIsBunk = true;

			time_t depTimeLocal = isStdOnFlightDelay ? duty->getFirstSegment()->getStartTimeLocSch() : duty->getFirstSegment()->getStartTimeLocAct();
			bool isInRange = TimeUtils::IsTimesInRange(checkinLocal, TimeUtils::hhmmToMinutes(checkin_lower), TimeUtils::hhmmToMinutes(checkin_upper));
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
						auto currentSeg = duty->getSegments()[i];
						auto nextSeg = duty->getSegments()[i + 1];
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
						if (iterFlt != this->_dbData->flightIdMap.end() && iterFlt->second->getDepStation() == crewbase)
							extensionULRFDP = atBaseFDPExtension;
						else {
							extensionULRFDP = outOfBaseFDPExtension;
						}
					}

				}
			}

			if (isInRange && departureInRange && dutyType && dutyFleet && matchSchBLH && (landing <= iLandingUpper && landing >= iLandingLow) && (strComplement == "" || complement == "*" || find(compositions.begin(), compositions.end(), strComplement) != compositions.end())) {
				duty->setLimitationValue(RULE_LIMITATION_TYPE::MAX_FDP, lMaxFDP, singleRule.idRule, singleRule.idRuleParam, singleRule.overridebility, singleRule.classType, singleRule.description, singleRule.reference);
			}
		}
	}
}



void LegalityChecker::setDutyDiscretion_R5(Duty * duty){

	//航班延误处理
	bool isStdOnFlightDelay = isUsedStdOnFlightDelay(duty);

	auto& dutyBuilder = this->_dbData->getRuleFunctions(RULES::MAX_FDP_PERDUTY);
	for (std::size_t j = 0; j < dutyBuilder.size(); j++){
		auto& parameter = dutyBuilder[j].params;
		vector<string> compositions;
		vector<string> duty_fleets;
		string header, headeValue;

		/*
		3	INCLUDE LAST DHD, N
		2	INCLUDE CHECK OUT, N
		1	DEFINITION, VALUE
		4	COMPOSITION, RPT START, RPT END, LANDING LOWER, LANDINGS UPPER, REST FACILITY, MAX FDP
		*/
		string complement, bunk, landing_lower = "0", landing_upper = "99", max_fdp = "9999", checkin_lower = "00:00", checkin_upper = "23:59", departure_start = "00:00", departure_end = "23:59", duty_type = "*", duty_fleet_str = "*",
			leg_sch_blh_start = "*", leg_sch_blh_end = "*";;
		string includeCO, includeLastDHD;
		bool isAugment = false;
		bool isSet = false;
		int RestFacility = 0;
		int ltRestThreadhold = 0;
		double ltRestRatio = 0.0;
		int legSchBLHStart = 0;
		int legSchBLHEnd = 0;
		for (auto iter = parameter.begin(); iter != parameter.end(); iter++)
		{

			header = iter->first;
			headeValue = iter->second;
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
				isSet = true;
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
				if (!headeValue.empty() && headeValue != "*") {
					ltRestThreadhold = TimeUtils::hhmmToMinutes(headeValue);
				}
			}
			if (header == "LT REST RATIO") {
				if (!headeValue.empty() && headeValue != "*") {
					ltRestRatio = atof(headeValue.c_str());
				}
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
		if (duty != nullptr && !PhaseUtils::IsChecked(duty, dutyBuilder[j].phase, this->_dbData)) {
			continue;
		}
		CalculationManday FDP = this->_dbData->getCalculationManday("FDP");
		CalculationManday ACT_FDP = this->_dbData->getCalculationManday("ACT FDP");
		if (isSet) {

			int iLandingLow = 0, iLandingUpper = 999, lMaxFDP = 9999;
			iLandingLow = stoi(landing_lower);
			iLandingUpper = stoi(landing_upper);
			//lMaxFDP是分钟
			lMaxFDP = stoi(max_fdp.substr(0, max_fdp.find(":"))) * 60 + stoi(max_fdp.substr(max_fdp.find(":") + 1));

			//duty->calculateFDP(0, FDP.str, FDP.end);
			//duty->calculateFDP(1, ACT_FDP.str, ACT_FDP.end);

			time_t checkinLocal = duty->getStartTimeLocAct();
			int landing = duty->getNumFlySegs();
			string strComplement = duty->getCompositionName();
			if (strComplement == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
			{
				strComplement = this->getCompositionByDuty(duty);
				//strComplement = this->pairingCompositionCalculator->calculatePairingCompositionForPilotR5_3007(duty);
				duty->setCompositionName(strComplement);
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
			bool bIsBunk = true;

			time_t depTimeLocal = isStdOnFlightDelay ? duty->getFirstSegment()->getStartTimeLocSch() : duty->getFirstSegment()->getStartTimeLocAct();
			bool departureInRange = TimeUtils::IsTimesInRange(depTimeLocal, TimeUtils::hhmmToMinutes(departure_start), TimeUtils::hhmmToMinutes(departure_end));

			bool dutyType = true;
			if (duty_type != "*")
				dutyType = DutyUtils::getDutyType(duty) == duty_type;

			bool dutyFleet = true;
			if (duty_fleet_str != "*") {
				const auto & seg = duty->getFirstFlySegment();
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
						long ltTime = static_cast<long>(nextSeg->getStartTimeUtcAct() - currentSeg->getEndTimeUtcAct());
						if (ltTime >= ltRestThreadhold * 60) {
							lMaxFDP += (int)(ltRestRatio * (ltTime / 60.0));
						}
					}
				}
			}

			long fdp = duty->getFDPInSecs();

			bool isInRange = TimeUtils::IsTimesInRange(checkinLocal, TimeUtils::hhmmToMinutes(checkin_lower), TimeUtils::hhmmToMinutes(checkin_upper));

			if (isInRange && departureInRange && dutyType && dutyFleet && matchSchBLH && (landing <= iLandingUpper && landing >= iLandingLow) && (find(compositions.begin(), compositions.end(), strComplement) != compositions.end())) {
				if (fdp > lMaxFDP * 60){
					duty->setFdpDiscretion((fdp - lMaxFDP * 60) / 60);
				}
				else{
					duty->setFdpDiscretion(0);
				}
			}
		}
	}
}

bool LegalityChecker::getIsAugment_3007(Duty * duty){

	//COMPOSITION,RPT START,RPT END,LANDING LOWER,LANDINGS UPPER,REST FACILITY,MAX FDP
	//2P,00:00,05:59,5,5,,11:00
	//COMPOSITION,RPT START,RPT END,MAX BLH
	//2P,00:00,04:58,08:00
	string complement, bunk, landing_lower = "0", landing_upper = "99", max_fdp = "9999", checkin_lower = "00:00", checkin_upper = "23:59", departure_start = "00:00", departure_end = "23:59", duty_type = "*";
	string includeCO, includeLastDHD;
	bool isAugment = false;

	string header, headValue;
	vector<string> compositions;
	vector<RULE_COMPOSITION>* rule_compositon = this->getCompositionDefinition();
	time_t checkinLocal = duty->getStartTimeLocAct();

	auto& templist = this->_dbData->getRuleFunctions(RULES::MAX_FDP_PERDUTY);

	long fdp = duty->getFDPInSecs();
	int landing = 0;
	landing = duty->getNumFlySegs();

	if (landing == 0)
	{
		for (auto& segment : duty->getSegments())
		{
			string ass = segment->getAssignment();
			if (ass == "OPR" || ass == "FLY")
				landing++;
		}
	}

	for (vector<RULE_COMPOSITION>::iterator it = rule_compositon->begin(); it != rule_compositon->end(); it++)
	{
		/*if (this->_application == PAIRING_OPTIMIZER && !RuleParams::GetInstancePtr()->canAugmented)
		{
			if ((*it).name != RuleParams::GetInstancePtr()->basicComposition)
				continue;
		}*/

		for (size_t iRule = 0; iRule < templist.size(); iRule++)
		{
			map<string, string> parameter = templist[iRule].params;
			map<string, string>::const_iterator iter;

			for (iter = parameter.begin(); iter != parameter.end(); iter++)
			{
				header = iter->first;
				headValue = iter->second;

				if (header == "COMPOSITION") {
					complement = headValue;
					split(complement, '|', compositions);
				}
				if (header == "REST FACILITY") {
					bunk = headValue;
				}
				if (header == "LANDING LOWER") {
					landing_lower = headValue;
				}
				if (header == "LANDINGS UPPER") {
					landing_upper = headValue;
				}
				if (header == "RPT START") {
					checkin_lower = headValue;
				}
				if (header == "RPT END") {
					checkin_upper = headValue;
				}
				if (header == "MAX FDP") {
					max_fdp = headValue;
				}
				if (header == "ISAUGMENT") {
					isAugment = (headValue == "Y");
				}
				if (header == "DEPARTURE START") {
					departure_start = headValue;
				}
				if (header == "DEPARTURE END") {
					departure_end = headValue;
				}
				if (header == "DUTY TYPE" || header == "DUTY DIR") {
					duty_type = headValue;
				}
			}

			if (this->_application == PAIRING_OPTIMIZER && !RuleParams::GetInstancePtr()->canAugmented)
			{
				if (isAugment)
					continue;
			}

			if (duty != nullptr && !PhaseUtils::IsChecked(duty, templist[iRule].phase, this->_dbData)) {
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

			if (duty_type != "*" && duty->getFirstSegment()->getDomIntType() == duty_type)
				continue;

			int iLandingLow = 0, iLandingUpper = 999, lMaxFDP = 9999;
			iLandingLow = stoi(landing_lower);
			iLandingUpper = stoi(landing_upper);
			if (!(landing <= iLandingUpper && landing >= iLandingLow))
				continue;

			//lMaxFDP是分钟
			lMaxFDP = hhmmToMinutes(max_fdp.c_str());

			map<string, int> mapComplement = duty->getComplementMap();
			string strComplement = Utility::GetInstancePtr()->getComplement(mapComplement);
			string strBase = duty->getDepStation();
			bool bIsBunk = true;

			if (fdp > lMaxFDP * 60)
				continue;

			return isAugment;
		}
	}
	return isAugment;
};

//20200515 ain, mantis#8288, 3007计算航段数忽略返航备降(fltSts=V/R)
static int getLangdingNums(Duty* duty, CrewDataContext* dbData){
	if (!duty) {
		return 0;
	}
	if (duty->getNumSegments() == 0) {
		return 0;
	}
	int num = 0;
	for (std::size_t i = 0; i < duty->getNumSegments(); i++){
		Segment* s = duty->getSegment(i);
		Segment* flt = s;
		if (dbData != nullptr) {
			auto iterFlt = dbData->flightIdMap.find(s->getDBId());
			if (iterFlt != dbData->flightIdMap.end() && iterFlt->second != nullptr) {
				flt = iterFlt->second.get();
			}
		}
		if (flt == nullptr) {
			Logger::getRuleLogger()->error("[getLangdingNums] dbData.flightIdMap[{}] is null.pairingId={}, dutyId={}", s->getDBId(), duty->getPairingId(), duty->getDutyId());
			continue;
		}
		string ass = flt->getAssignment();
		if (flt->getFltSts() != "V"
			&& flt->getFltSts() != "R"
			&& flt->getIsOperating()){
			num++;
		}

	}
	return num;
}
