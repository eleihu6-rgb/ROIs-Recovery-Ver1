#pragma once

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




//this interface is only for RosterOptimizer to enhance rule check perfomance
bool LegalityChecker::checkAttributeByPairing(SharedPtr<CREW> crew, Pairing* pairing, string actingRank, const DBRule* singleRule)
{
	if (this->_application != ROSTER_OPTIMIZER)
	{
		printf("Warning: this interface is only designed for Optimizer.\n");
		return true;
	}
	rule8006 * cache = (rule8006*)singleRule->parsedParam.get();
	string strBase = cache->strBase;
	string strRank = cache->strRank;
	string strFleet = cache->strFleet;
	string strCrewTeam = cache->strTeam;
	vector<string>& strAttributes = cache->attributes;
	//对于RO来说，假设无需检查ASSIGNMENT GROUPS，缺省RO都是安排FLY pairing
	vector<string>& strAssGroups = cache->assignmentGroups;
	vector<string>& crewNationality = cache->crewNationality;

	if (crew->teamList.size() == 0 && strCrewTeam != "*") {
		return true;
	}
	if (!pairing)
	{
		Logger::getRuleLogger()->error("ERROR: rule 8006 fail, invalid pairing index.");
		return false;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, strCrewTeam, "*", pairing->getStartTimeUtc(), pairing->getEndTimeUtc())) {
		return true;
	}
	//20200515 ain, op#2390, crew匹配条件增加国籍nationality
	if (!(crewNationality[0] == "*" && crewNationality.size() == 1)) {
		if (std::find(crewNationality.begin(), crewNationality.end(), crew->nationality) == crewNationality.end())
			return true;
	}

	string atts = pairing->getAttribute();
	bool bFound = false;
	for (auto& att : strAttributes)
	{
		if (atts.find(att) != string::npos)
		{
			bFound = true;
			break;
		}
	}
	return bFound;
}

//CREW_APPLICABLE_PTN (8006)
//Rule Parameters: BASES,RANKS,FLEETS,CREW TEAMS,APPLICABLE ATTRIBUTES
bool LegalityChecker::checkApplicablePTNForCrew(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	rule8006 * cache = (rule8006*)singleRule->parsedParam.get();
	string strBase = cache->strBase;
	string strRank = cache->strRank;
	string strFleet = cache->strFleet;
	string strCrewTeam = cache->strTeam;
	vector<string>& strAttributes = cache->attributes;
	vector<string>& strAssGroups = cache->assignmentGroups;
	vector<string>& crewNationality = cache->crewNationality;
	bool isLegal = true;
	//
	SharedPtr<CREW>& crew = _dbData->crewList[pCrew->crewIndex];
	if (crew->rosterList.size() == 0) {
		return true;
	}
	/*if (crew->teamList.size() == 0) {
		return true;
	}*/
	if (pCrew->RosterIndex > (int)crew->rosterList.size()) {
		Logger::getRuleLogger()->error("ERROR: rule 8006 fail, invalid param rosterIndex={} not exist on crew={}", pCrew->RosterIndex, crew->idCrew);
		return false;
	}
	vector<SharedPtr<ROSTER>>::iterator checkRosterBeg = crew->rosterList.begin();
	vector<SharedPtr<ROSTER>>::iterator checkRosterEnd = crew->rosterList.end();
	if (pCrew->RosterIndex != -1 && this->_application == ROSTER_OPTIMIZER) {
		checkRosterBeg = crew->rosterList.begin() + pCrew->RosterIndex;
		checkRosterEnd = checkRosterBeg + 1;
	}
	for (auto& it = checkRosterBeg; it != checkRosterEnd; it++) {

		SharedPtr<ROSTER> roster = (*it);
		if (roster->pairId == 0) {
			continue;
		}
		//base/rank/fleet/team
		if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, strCrewTeam, "*", roster->actStrUtc, roster->actEndUtc)) {
			continue;
		}
		if (!Utility::GetInstancePtr()->isCrewTeamQualified(crew, strCrewTeam, roster->actStrUtc, roster->actEndUtc))
			continue;
		if (!(strAssGroups[0] == "*" && strAssGroups.size() == 1))
		{
			if (std::find(strAssGroups.begin(), strAssGroups.end(), roster->duty) == strAssGroups.end())
				continue;
		}
		//20200515 ain, op#2390, crew匹配条件增加国籍nationality
		if (!(crewNationality[0] == "*" && crewNationality.size() == 1)) {
			if (std::find(crewNationality.begin(), crewNationality.end(), crew->nationality) == crewNationality.end())
				continue;
		}
		string atts = (*it)->pairing->getAttribute();
		//if (atts == "") {
		//	continue;//20190123 ain, mantis#4884, 8006, ptn.attr=""无需检查  
		//}
		bool bFound = false;
		for (auto& att : strAttributes)
		{
			if (atts.find(att) != string::npos)
			{
				bFound = true;
				break;
			}
		}
		if (!bFound)
		{
			isLegal = false;
			stringstream ss;
			ss << "This Crew is not applicable for this pairing(Pairing ID=" << (*it)->pairId << "), crew=" << crew->idCrew << ".";
			string msg = ss.str();
			pCrew->legalMessage.push_back(msg);
			this->setLegalityMessage((*it), pCrew, singleRule, msg);
			pCrew->isLegal = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
			rv->rosterId = (roster)->rosterId;
			rv->pairingId = (roster)->pairId;
			rv->startDTUtc = (*it)->actStrUtc;
			rv->endDTUtc = (*it)->actEndUtc;
			rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
			rv->operation_result.insert(pair<string, string>("pairId", Utility::GetInstancePtr()->llToa((*it)->pairId)));
			rv->operation_result.insert(pair<string, string>("idCrew", crew->idCrew));
			rv->violation_msg = msg;
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER){
				return false;
			}
		}
	}

	return isLegal;
}


