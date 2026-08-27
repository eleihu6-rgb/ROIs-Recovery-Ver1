#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "../utils/RosterUtils.h"
#include "../utils/DutyUtils.h"

bool LegalityChecker::checkFDPPerDutyByDuty_R4(Duty * duty, SharedPtr<ROSTER> roster, const DBRule* singleRule){

	if (RosterUtils::ExistExceptionCode(roster.get(), duty, singleRule->exceptionCodes, this->_dbData)) {
		return true;
	}

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	bool isAugment = false;
	string complement, bunk = "*", max_fdp = "9999", max_extension;
	string includeCO, includeLastDHD;
	bool isCheckRule = false;
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "COMPOSITION") {
			complement = headeValue;
		}
		if (header == "WITH_BUNK") {
			bunk = headeValue;
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
	}

	if (_application == PAIRING_OPTIMIZER && (!RuleParams::GetInstancePtr()->canAugmented)){
		if (isAugment)
			return true;
	}

	CalculationManday FDP = this->_dbData->getCalculationManday("FDP");

	if (isCheckRule)
	{
		int lMaxFDP = 9999,iMaxExtension = 0;
		//duty->calculateFDP(0, FDP.str, FDP.end);
		//iMaxExtension单位为s;
		//lMaxFDP是分钟
		lMaxFDP = hhmmToMinutes(max_fdp.c_str());
		//若seg延误则fdp可以延长
		if (duty->getFDPInSecs() > lMaxFDP * 60){
			for (int i = (int)duty->getSegments().size() - 1; i < (int)duty->getSegments().size() && i > 0; i++){
				Segment* seg = duty->getSegment(i);
				if (seg->getEndTimeUtcAct() > seg->getEndTimeUtcSch()){
					iMaxExtension = hhmmStrToMinutes(max_extension) * 60;
					break;
				}
			}
		}

		string compName = duty->getCompositionName();
		if (compName == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
		{
			compName = this->getCompositionByDuty(duty);
			//compName = this->pairingCompositionCalculator->calculatePairingCompositionForPilotR4_2007(duty);
			duty->setCompositionName(compName);
		}

		map<string, int>& resBunks = RuleParams::GetInstancePtr()->rest_bunk;
		vector<Segment*> segments = duty->getSegments();
		bool hasBunk = false;
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
		int i = DutyUtils::GetRestfacility(duty, this->_dbData);
		//int i = 9999;
		//for (auto& segment : duty->getSegments())
		//{
		//	string tailNumber = segment->getTailNum();
		//	int ii = 0;
		//	//20191210 ain, mantis#7251, 2007/2008, 避免 fltIdToAircraftMap出现 key="" value=empty
		//	if (this->_dbData->fltIdToAircraftMap.find(tailNumber) == this->_dbData->fltIdToAircraftMap.end()){
		//		continue;
		//	}
		//	DBAircraft* aircraft = this->_dbData->fltIdToAircraftMap[tailNumber].get();
		//	if (aircraft != NULL){
		//		if (aircraft->isExistRest){
		//			ii = aircraft->restFacility;
		//		}
		//	}
		//	if (ii < i)i = ii;
		//}
		if (i > 0){
			hasBunk = true;
		}
		else{
			hasBunk = false;
		}
		if (bunk != "*")
		{
			if (bunk == "Y" && !hasBunk)
				return true;
			if (bunk == "N" && hasBunk)
				return true;
		}

		//if (duty->getPairingId() == 27377093 )
		//	printf("");
		int fdpDiscretion = 0;
		auto discretionTypes = duty->getDiscretionTypes();
		if (!discretionTypes.empty() && !discretionTypes[0].empty() && find(discretionTypes.begin(), discretionTypes.end(), "FDP") != discretionTypes.end()) {
			fdpDiscretion = duty->getFdpDiscretion();
		}
		long fdp = duty->getFDPInSecs() + fdpDiscretion * 60;
		if (complement == "*" || compName == complement) {
			if (fdp > lMaxFDP * 60 + iMaxExtension&& iMaxExtension != 0){
				if (this->_application == PAIRING_OPTIMIZER || this->_application == ROSTER_OPTIMIZER)
					return false;
				string errorMsg = "The Flight Duty Period(" + Utility::GetInstancePtr()->formatMinutes(fdp / 60);
				errorMsg += ") exceeds the limitation(" + Utility::GetInstancePtr()->formatMinutes(lMaxFDP + iMaxExtension / 60)
					+ "), Crew Composition=" + complement;
				errorMsg += ",with Rest Facility(" + bunk + ").";
				duty->setViolationMessage(errorMsg);
				duty->setLegality(false);
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->pairingId = duty->getPairingId();
				rv->dutySequenceNumber = duty->getDutySegNum();
				rv->idRule = singleRule->idRule;
				rv->ruleParamId = singleRule->idRuleParam;
				rv->startDTUtc = duty->getStartTimeUtcAct();
				rv->endDTUtc = duty->getEndTimeUtcAct();
				rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
				if (roster != nullptr) {
					rv->crewId = roster->idcrew;
					rv->rosterId = roster->rosterId;
					rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				}
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("fdp", Utility::GetInstancePtr()->formatMinutes(fdp / 60)));
				rv->operation_result.insert(pair<string, string>("max_extension_fdp", Utility::GetInstancePtr()->formatMinutes(lMaxFDP + iMaxExtension / 60)));
				rv->operation_result.insert(pair<string, string>("complement", complement));
				rv->operation_result.insert(pair<string, string>("bunk", bunk));
				rv->violation_msg = errorMsg;
				this->addRuleViolations(rv, singleRule);
				return false;
			}
			else if (fdp > lMaxFDP * 60 && fdp <= lMaxFDP * 60 + iMaxExtension && iMaxExtension != 0){
				if (this->_application == PAIRING_OPTIMIZER || this->_application == ROSTER_OPTIMIZER)
					return false;
				string errorMsg = "The Flight Duty Period(" + Utility::GetInstancePtr()->formatMinutes(fdp / 60);
				errorMsg += ") exceeds the limitation(" + Utility::GetInstancePtr()->formatMinutes(lMaxFDP)
					+ ") + (but is within the extension limitation(" + Utility::GetInstancePtr()->formatMinutes(lMaxFDP + iMaxExtension / 60) + "), Crew Composition=" + complement;
				errorMsg += ",with Rest Facility(" + bunk + ").";
				duty->setViolationMessage(errorMsg);
				duty->setLegality(false);
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->pairingId = duty->getPairingId();
				rv->dutySequenceNumber = duty->getDutySegNum();
				rv->idRule = singleRule->idRule;
				rv->ruleParamId = singleRule->idRuleParam;
				rv->startDTUtc = duty->getStartTimeUtcAct();
				rv->endDTUtc = duty->getEndTimeUtcAct();
				rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
				if (roster != nullptr) {
					rv->crewId = roster->idcrew;
					rv->rosterId = roster->rosterId;
					rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				}
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("fdp", Utility::GetInstancePtr()->formatMinutes(fdp / 60)));
				rv->operation_result.insert(pair<string, string>("max_fdp", Utility::GetInstancePtr()->formatMinutes(fdp / 60)));
				rv->operation_result.insert(pair<string, string>("max_extension_fdp", Utility::GetInstancePtr()->formatMinutes(lMaxFDP + iMaxExtension / 60)));
				rv->operation_result.insert(pair<string, string>("complement", complement));
				rv->operation_result.insert(pair<string, string>("bunk", bunk));
				rv->violation_msg = errorMsg;
				this->addRuleViolations(rv, singleRule);
				return false;
			}
			else if (fdp > lMaxFDP * 60){
				if (this->_application == PAIRING_OPTIMIZER || this->_application == ROSTER_OPTIMIZER)
					return false;
				string errorMsg = "The Flight Duty Period(" + Utility::GetInstancePtr()->formatMinutes(fdp / 60);
				errorMsg += ") exceeds the limitation(" + Utility::GetInstancePtr()->formatMinutes(lMaxFDP)
					+ "), Crew Composition=" + complement;
				errorMsg += ",with Rest Facility(" + bunk + ").";
				duty->setViolationMessage(errorMsg);
				duty->setLegality(false);
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->pairingId = duty->getPairingId();
				rv->dutySequenceNumber = duty->getDutySegNum();
				rv->idRule = singleRule->idRule;
				rv->ruleParamId = singleRule->idRuleParam;
				rv->startDTUtc = duty->getStartTimeUtcAct();
				rv->endDTUtc = duty->getEndTimeUtcAct();
				rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
				if (roster != nullptr) {
					rv->crewId = roster->idcrew;
					rv->rosterId = roster->rosterId;
					rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				}
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("fdp", Utility::GetInstancePtr()->formatMinutes(fdp / 60)));
				rv->operation_result.insert(pair<string, string>("max_fdp", Utility::GetInstancePtr()->formatMinutes(lMaxFDP)));
				rv->operation_result.insert(pair<string, string>("complement", complement));
				rv->operation_result.insert(pair<string, string>("bunk", bunk));
				rv->violation_msg = errorMsg;
				this->addRuleViolations(rv, singleRule);
				return false;
			}
		}
	}
	return true;
}

bool LegalityChecker::checkFDPPerDuty(RULE_LEGALITY * pPairing, const DBRule* singleRule)
{
	bool isValid = true;

	vector<std::tuple<Pairing*, std::shared_ptr<ROSTER>>> pgr;

	if (this->GetApplication() == ROSTER_OPTIMIZER && pPairing->crewIndex >= 0)
	{
		pgr.push_back(std::make_tuple(this->_dbData->crewList[pPairing->crewIndex]->rosterList[pPairing->RosterIndex]->pairing, nullptr));
	}
	else if (this->GetApplication() == PAIRING_OPTIMIZER)
	{
		pgr.push_back(std::make_tuple(this->_pgCheckList[pPairing->PairingIndex], nullptr));
	}
	else if (pPairing->PairingIndex >= 0)
	{
		//to do list for other applications
		pgr.push_back(std::make_tuple(this->_pgCheckList[pPairing->PairingIndex], nullptr));
	}
	else if (pPairing->crewIndex >= 0)
	{
		auto& crew = this->_dbData->crewList[pPairing->crewIndex];
		for (auto& roster : crew->rosterList) {
			if (roster->pairing != nullptr) {
				pgr.push_back(std::make_tuple(roster->pairing, roster));
			}
		}
	}
	else
		return true;
	int func = singleRule->function;
	for (auto iter = pgr.begin(); iter != pgr.end(); iter++){
		auto& [pg, roster] = *iter;
		for (size_t j = 0; j < pg->getDutyVec().size(); j++){

			Duty* duty = (pg->getDutyVec())[j];

			Duty::DUTY_TYPE dtType = duty->getType();
			if (dtType == Duty::DUTY_PAIRING_REST || dtType == Duty::DUTY_BLANK_DAY){
				continue;
			}


			this->checkFDPPerDutyByDuty_R4(duty, roster, singleRule);

		}
	}
	return isValid;
}

void LegalityChecker::setDutyDiscretion_R4(Duty * duty){
	auto& dutyBuilder = this->_dbData->getRuleFunctions(RULES::MAX_FDP_PERDUTY_R4);
	for (std::size_t i = 0; i < dutyBuilder.size(); i++){
		auto& parameter = dutyBuilder[i].params;

		string header, headeValue;
		bool isAugment = false;
		string complement, bunk = "*", max_fdp = "9999";
		string includeCO, includeLastDHD;
		bool isSet = false;
		for (auto iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;
			if (header == "COMPOSITION") {
				complement = headeValue;
			}
			if (header == "WITH_BUNK") {
				bunk = headeValue;
			}
			if (header == "MAX FDP") {
				max_fdp = headeValue;
				isSet = true;
			}
			if (header == "ISAUGMENT") {
				isAugment = (headeValue == "Y");
			}
		}

		if (_application == PAIRING_OPTIMIZER && (!RuleParams::GetInstancePtr()->canAugmented)){
			if (isAugment)
				continue;
		}

		CalculationManday FDP = this->_dbData->getCalculationManday("FDP");

		if (isSet)
		{
			int lMaxFDP = 9999;
			//lMaxFDP是分钟
			lMaxFDP = hhmmToMinutes(max_fdp.c_str());

			//duty->calculateFDP(0, FDP.str, FDP.end);

			string compName = duty->getCompositionName();
			if (compName == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
			{
				compName = this->getCompositionByDuty(duty);
				//compName = this->pairingCompositionCalculator->calculatePairingCompositionForPilotR4_2007(duty);
				duty->setCompositionName(compName);
			}

			map<string, int>& resBunks = RuleParams::GetInstancePtr()->rest_bunk;
			vector<Segment*> segments = duty->getSegments();
			bool hasBunk = false;
			for (auto& segment : segments)
			{
				string fleet = segment->getFleetCD();
				int i = 0;
				i = resBunks[fleet];
				if ((i >= 0) && (hasBunk || segments.size() == 1))
				{
					hasBunk = true;
				}
				else
					hasBunk = false;
			}

			if (bunk != "*")
			{
				if (bunk == "Y" && !hasBunk)
					continue;
				if (bunk == "N" && hasBunk)
					continue;
			}
			long fdp = duty->getFDPInSecs();
			if (compName == complement) {
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


bool LegalityChecker::getIsAugment_2007(Duty * duty){
	//RULE_COMPOSITION* composition = new RULE_COMPOSITION();//20190418 ain, mantis#5183, clear mem leak


	vector<RULE_COMPOSITION>* rule_compositon = this->getCompositionDefinition();

	auto& rules = this->_dbData->getRuleFunctions(RULES::MAX_FDP_PERDUTY_R4);

	long fdp = duty->getFDPInSecs();
	map<string, int> mapComplement = duty->getComplementMap();
	string strComplement = Utility::GetInstancePtr()->getComplement(mapComplement);

	map<string, int>& resBunks = RuleParams::GetInstancePtr()->rest_bunk;
	bool hasBunk = false;
	for (auto& segment : duty->getSegments())
	{
		string fleet = segment->getFleetCD();
		int i = 0;
		i = resBunks[fleet];
		if ((i >= 0) && (hasBunk || duty->getSegments().size() == 1))
		{
			hasBunk = true;
		}
		else
			hasBunk = false;
	}

	string header, headValue;
	string complement, bunk = "*", max_fdp = "9999";
	bool isAugment = false;
	//COMPOSITION,WITH_BUNK,MAX FDP
	for (vector<RULE_COMPOSITION>::iterator it = rule_compositon->begin(); it != rule_compositon->end(); it++)
	{
		/*if (this->_application == PAIRING_OPTIMIZER && !RuleParams::GetInstancePtr()->canAugmented)
		{
			if ((*it).name != RuleParams::GetInstancePtr()->basicComposition)
				continue;
		}*/
		for (size_t iRule = 0; iRule < rules.size(); iRule++)
		{
			map<string, string> parameter = rules[iRule].params;
			map<string, string>::const_iterator iter;

			for (iter = parameter.begin(); iter != parameter.end(); iter++)
			{
				header = iter->first;
				headValue = iter->second;

				if (header == "COMPOSITION") {
					complement = headValue;
				}
				if (header == "WITH_BUNK") {
					bunk = headValue;
				}

				if (header == "MAX FDP") {
					max_fdp = headValue;
				}
				if (header == "ISAUGMENT") {
					isAugment = (headValue == "Y");
				}
			}

			if (complement != (*it).name)
				continue;

			//lMaxFDP是分钟
			int lMaxFDP = hhmmToMinutes(max_fdp.c_str());

			if (bunk != "*")
			{
				if (bunk == "Y" && !hasBunk)
					continue;
				if (bunk == "N" && hasBunk)
					continue;
			}

			if (fdp > lMaxFDP * 60)
				continue;
			
			return isAugment;
		}
	}
	return isAugment;
};
