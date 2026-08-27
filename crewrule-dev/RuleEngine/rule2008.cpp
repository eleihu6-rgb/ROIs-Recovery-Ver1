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

bool LegalityChecker::checkBlockPerDuty(RULE_LEGALITY * pPairing, const DBRule* singleRule)
{
	bool isValid = true;
	vector<Pairing*> pg;
	if (this->GetApplication() == ROSTER_OPTIMIZER && pPairing->crewIndex >= 0)
	{
		pg.push_back(this->_dbData->crewList[pPairing->crewIndex]->rosterList[pPairing->RosterIndex]->pairing);
	}
	else if (this->GetApplication() == PAIRING_OPTIMIZER)
	{
		pg.push_back(this->_pgCheckList[pPairing->PairingIndex]);
	}
	else if (pPairing->PairingIndex >= 0)
	{
		//to do list for other applications
		pg.push_back(this->_pgCheckList[pPairing->PairingIndex]);
	}
	int func = singleRule->function;

	//RULES::CHECK_IN_OUT:
	for (vector<Pairing*>::iterator iter = pg.begin(); iter != pg.end(); iter++){

		for (std::size_t j = 0; j < (*iter)->getDutyVec().size(); j++){
			Duty* duty = ((*iter)->getDutyVec())[j];
			Duty::DUTY_TYPE	dt = duty->getType();
			if ((dt != Duty::DUTY_PURE_OPR) && (dt != Duty::DUTY_FLY))
				continue;
			bool bLegal = true;
			if (func == RULES::MAX_BLOCK_PERDUTY_R4){
				bLegal = this->checkBlockPerDutyByDuty_R4(duty, singleRule);
			}
			if (!bLegal) {
				if (this->_application == PAIRING_OPTIMIZER)
					return false;
				string msg = "Illegal Pairing: The actual Block Hours exceed the maximum allowed.";
				setLegalityMessage(duty, pPairing, singleRule, msg);
				pPairing->isLegal = false;
				isValid = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				//rv->crewId = this->_dbData->crewList[pPairing->crewIndex]->idCrew;
				//rv->rosterId = (*it_roster)->rosterId;
				rv->pairingId = (*iter)->getDbId();
				rv->dutySequenceNumber = duty->getDutySegNum();
				//rv->segmentId = current->getDBId();
				rv->startDTUtc = duty->getStartTimeUtcAct();
				rv->endDTUtc = duty->getEndTimeUtcAct();
				rv->ruleParamId = singleRule->idRuleParam;
				rv->violation_msg = msg;
				rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER){
					return false;
				}
			}
		}
	}
	return isValid;
}
bool LegalityChecker::checkBlockPerDuty_Roster(RULE_LEGALITY * pPairing)
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
				bLegal = this->checkBlockPerDutyByDuty(duty, roster);
			}
			else{
				bLegal = this->checkBlockPerDutyByDuty(duty);
			}
		}
	}
	return isValid;
}
bool LegalityChecker::checkBlockPerDutyByDuty_R4(Duty * duty, const DBRule* singleRule)
{
	bool bReturn = true;
	auto& parameter = singleRule->params;
	map<string, string>::const_iterator iter;
	string header, headeValue;
	bool isAugment = false;
	string complement, bunk = "*", landing_lower = "0", landing_upper = "99", max_blh = "9999:00", checkin_lower = "00:00", checkin_upper = "23:59";
	string strDefinition, strValue;
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "COMPOSITION") {
			complement = headeValue;
		}
		if (header == "WITH_BUNK") {
			bunk = headeValue;
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
			transform(strDefinition.begin(), strDefinition.end(), strDefinition.begin(), ::toupper);
		}
		if (header == "VALUE") {
			strValue = headeValue;
		}
		if (header == "ISAUGMENT") {
			isAugment = (headeValue == "Y");
		}
	}

	if (strDefinition == "USEHISTORICALBLH")
	{
		vector<Segment *> seglist = duty->getSegments();
		for (vector<Segment *>::iterator iter = seglist.begin(); iter != seglist.end(); iter++){
			(*iter)->setHistoricalBlhFlag(strValue == "Y");
		}
		return true;
	}

	if (_application == PAIRING_OPTIMIZER && (!RuleParams::GetInstancePtr()->canAugmented)){
		if (isAugment)
			return true;
	}

	int iLandingLow = 0, iLandingUpper = 999, lMaxBlock = 9999;
	//20160107 mod by ain: 增加landingTimes为空逻辑，为空时不控制（按0~99）
	if (landing_lower != "")
		iLandingLow =stoi(landing_lower);
	if (landing_upper != "")
		iLandingUpper = stoi(landing_upper);
	//lMaxBlock 分钟 12:01
	lMaxBlock = hhmmToMinutes(max_blh.c_str());
	//DEBUG
	duty->calculateDutyValues(this->_application);
	//minutes

	long plnBlk = duty->getBLKInMins();
	long actBlk = duty->getActualBlockTime();
	int landing = duty->getNumFlySegs();

	//map<string, int> mapComplement = duty->getComplementMap();
	//string strComplement = Utility::GetInstancePtr()->getComplement(mapComplement);

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
	int i = 9999;
	for (auto& segment : segments)
	{
		string tailNumber = segment->getTailNum();
		int ii = 0;
		//20191210 ain, mantis#7251, 2007/2008, 避免 fltIdToAircraftMap出现 key="" value=empty
		if (this->_dbData->fltIdToAircraftMap.find(tailNumber) == this->_dbData->fltIdToAircraftMap.end()){
			continue;
		}
		DBAircraft* aircraft = this->_dbData->fltIdToAircraftMap[tailNumber].get();
		if (aircraft != NULL){
			ii = aircraft->isExistRest;
		}
		if (ii < i)i = ii;
	}
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

	string compName = duty->getCompositionName();
	if (compName == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
	{
		compName = this->getCompositionByDuty(duty);
		//compName = this->pairingCompositionCalculator->calculatePairingCompositionForPilotR4_2008(duty);
		duty->setCompositionName(compName);
	}
	string errorMsg = "";
	if ((landing <= iLandingUpper && landing >= iLandingLow) && (compName == complement))
	{
		if (actBlk > 0 && actBlk > lMaxBlock){
			if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == ROSTER_OPTIMIZER)
				return false;

			errorMsg += "The Actual Block Hours (" + Utility::GetInstancePtr()->formatMinutes(actBlk);
			errorMsg += ") exceed the limitation(" + max_blh + "), Crew Composition=" + complement;
			errorMsg += ",Reported Period(" + checkin_lower + "-" + checkin_upper + ").";
			duty->setViolationMessage(errorMsg);
			duty->setLegality(false);

			 bReturn = false;
		}
		else if ((plnBlk > lMaxBlock))
		{
			if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == ROSTER_OPTIMIZER)
				return false;

			errorMsg += "The Planned Block Hours (" + Utility::GetInstancePtr()->formatMinutes(plnBlk);
			errorMsg += ") exceed the limitation(" + max_blh + "), Crew Composition=" + complement;
			errorMsg += ",Reported Period(" + checkin_lower + "-" + checkin_upper + ").";
			duty->setViolationMessage(errorMsg);
			duty->setLegality(false);

			bReturn = false;
		}
		if (!bReturn){
			if (this->GetApplication() == PAIRING_OPTIMIZER || this->GetApplication() == ROSTER_OPTIMIZER)
				return false;

			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->pairingId = duty->getPairingId();
			rv->dutySequenceNumber = duty->getDutySegNum();
			rv->idRule = singleRule->idRule;
			rv->ruleParamId = singleRule->idRuleParam;
			rv->startDTUtc = duty->getStartTimeUtcAct();
			rv->endDTUtc = duty->getEndTimeUtcAct();
			rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("actBlk", Utility::GetInstancePtr()->formatMinutes(actBlk)));
			rv->operation_result.insert(pair<string, string>("plnBlk", Utility::GetInstancePtr()->formatMinutes(plnBlk)));
			rv->operation_result.insert(pair<string, string>("max_blh", max_blh));
			rv->operation_result.insert(pair<string, string>("complement", complement));
			rv->operation_result.insert(pair<string, string>("checkin_lower", checkin_lower));
			rv->operation_result.insert(pair<string, string>("checkin_upper", checkin_upper));
			rv->violation_msg = errorMsg;
			this->addRuleViolations(rv, singleRule);
		}

	}

	return bReturn;
}



bool LegalityChecker::getIsAugment_2008(Duty * duty){
	//RULE_COMPOSITION* composition = new RULE_COMPOSITION();//20190418 ain, mantis#5183, clear mem leak

	int landing = 0;
	landing = duty->getNumFlySegs();

	vector<Segment *> segments = duty->getSegments();

	if (landing == 0)
	{
		for (auto& segment : segments)
		{
			string ass = segment->getAssignment();
			if (ass == "OPR" || ass == "FLY")
				landing++;
		}
	}

	string header, headeValue;
	string complement, max_blh = "9999", checkin_lower = "00:00", checkin_upper = "23:59";
	string strDefinition, strValue = "N";
	bool isAugment = false;
	vector<RULE_COMPOSITION>* rule_compositon = this->getCompositionDefinition();

	auto& rules = this->_dbData->getRuleFunctions(RULES::MAX_BLOCK_PERDUTY_R4);
	map<string, string>::const_iterator iter;

	for (auto& rule : rules)
	{
		if (rule.tableNum == 2)
			continue;
		map<string, string> parameter = rule.params;

		for (iter = parameter.begin(); iter != parameter.end(); ++iter)
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

	long block = 0;
	map<string, int>& resBunks = RuleParams::GetInstancePtr()->rest_bunk;
	bool hasBunk = false;
	for (auto & segment : segments)
	{
		if ((strDefinition == "USEHISTORICALBLH") && (strValue == "Y"))
		{
			segment->setHistoricalBlhFlag(true);
		}
		block += segment->getBlkMinutes();
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

	//COMPOSITION,WITH_BUNK,LANDING_TIMES_LOWER,LANDING_TIMES_UPPER,AC CHANGE,MAX BLH
	string landing_upper, landing_lower, acChg, with_bunk = "*";
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
				}
				if (header == "WITH_BUNK") {
					with_bunk = headeValue;
				}
				if (header == "LANDING_TIMES_LOWER") {
					landing_lower = headeValue;
				}
				if (header == "LANDING_TIMES_UPPER") {
					landing_upper = headeValue;
				}
				if (header == "AC CHANGE") {
					acChg = headeValue;
				}
				if (header == "MAX BLH") {
					max_blh = headeValue;
				}
				if (header == "ISAUGMENT") {
					isAugment = (headeValue == "Y");
				}

			}

			if (complement != (*it).name)
				continue;
			long lMaxBlock = hhmmToMinutes(max_blh.c_str());

			int iLandingLow = 0, iLandingUpper = 999;
			if (landing_lower != "")
				iLandingLow = stoi(landing_lower);
			if (landing_upper != "")
				iLandingUpper = stoi(landing_upper);

			if (!(landing >= iLandingLow && landing <= iLandingUpper))
				continue;

			if (with_bunk != "*")
			{
				if (with_bunk == "Y" && !hasBunk)
					continue;
				if (with_bunk == "N" && hasBunk)
					continue;
			}

			if (block > lMaxBlock)
				continue;

			return isAugment;
		}
	}

	return isAugment;
};