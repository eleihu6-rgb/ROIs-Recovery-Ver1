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

using namespace std;


bool LegalityChecker::checkMaxAttribute(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string strAttribute, strMax, strBase = "*", strRank = "*", strFleet = "*", strPeriod = "CM", strUnit = "1", strDests = "*";
	string weekdayStartFrom = this->getCrewContext()->getWeekdayStartFrom();
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		//BASE,RANK,FLEET,ATTRIBUTE,PERIOD,UNIT,MAX TIMES
		header = iter->first;
		headeValue = iter->second;
		if (header == "ATTRIBUTE") {
			strAttribute = headeValue;
		}
		if (header == "MAX TIMES") {
			strMax = headeValue;
		}
		if (header == "RANKS") {
			strRank = headeValue;
		}
		if (header == "FLEETS") {
			strFleet = headeValue;
		}
		if (header == "BASES") {
			strBase = headeValue;
		}
		if (header == "PERIOD") {
			strPeriod = headeValue;
		}
		if (header == "UNIT") {
			strUnit = headeValue;
		}
		if (header == "DESTINATIONS") {
			strDests = headeValue;
		}
	}

	double dMax = stod(strMax);

	vector<string> strDestinations, strRanks, strFleets, strBases;
	split(strDests, '|', strDestinations);
	split(strRank, '|', strRanks);
	split(strFleet, '|', strFleets);
	split(strBase, '|', strBases);

	if (this->GetApplication() == ROSTER_OPTIMIZER)
	{
		if (!(this->_dbData->crewList[pCrew->crewIndex]->rosterList[pCrew->RosterIndex]->pairing))
			return true;
		std::string::size_type aPos = this->_dbData->crewList[pCrew->crewIndex]->rosterList[pCrew->RosterIndex]->pairing->getAttribute().find(strAttribute);
		if (aPos == std::string::npos)
		{
			return true;
		}
	}
	vector<SharedPtr<CREW_BASE>> bases = this->_dbData->crewList[pCrew->crewIndex]->baseList;
	vector<SharedPtr<CREW_FLEET>> fleets = this->_dbData->crewList[pCrew->crewIndex]->fleetList;
	vector<SharedPtr<CREW_RANK>> ranks = this->_dbData->crewList[pCrew->crewIndex]->rankList;
	bool bFound = false;
	if (strBase != "*" && !strBase.empty())
	{
		for (vector<SharedPtr<CREW_BASE>>::iterator base_it = bases.begin(); base_it != bases.end(); ++base_it)
		{
			if (
				((*base_it)->effUtc < this->_dbData->scenario.endDtUTC)
				&&
				((*base_it)->expUtc<0 || (*base_it)->expUtc > this->_dbData->scenario.startDtUTC)
				)
			{
				//if ((*base_it)->base == strBase)
				if (std::find(strBases.begin(), strBases.end(), (*base_it)->base) != strBases.end())
					bFound = true;
			}
		}
		if (!bFound)
			return true;
	}
	bFound = false;
	if (strFleet != "*" && !strFleet.empty())
	{
		for (vector<SharedPtr<CREW_FLEET>>::iterator fleet_it = fleets.begin(); fleet_it != fleets.end(); ++fleet_it)
		{
			if (
				((*fleet_it)->effUtc < this->_dbData->scenario.endDtUTC)
				&&
				((*fleet_it)->expUtc<0 || (*fleet_it)->expUtc > this->_dbData->scenario.startDtUTC)
				)
			{
				//if ((*fleet_it)->fleet == strFleet)
				if (std::find(strFleets.begin(), strFleets.end(), (*fleet_it)->fleet) != strFleets.end())
					bFound = true;
			}
		}
		if (!bFound)
			return true;
	}

	bFound = false;
	if (strRank != "*" && !strRank.empty())
	{
		for (vector<SharedPtr<CREW_RANK>>::iterator rank_it = ranks.begin(); rank_it != ranks.end(); ++rank_it)
		{
			if (
				((*rank_it)->effUtc < this->_dbData->scenario.endDtUTC)
				&&
				((*rank_it)->expUtc<0 || (*rank_it)->expUtc > this->_dbData->scenario.startDtUTC)
				)
			{
				//if ((*rank_it)->rank == strRank)
				if (std::find(strRanks.begin(), strRanks.end(), (*rank_it)->rank) != strRanks.end())
					bFound = true;
			}
		}
		if (!bFound)
			return true;
	}
	bool isFound = false;
	vector<SharedPtr<ROSTER>>& rosters = this->_dbData->crewList[pCrew->crewIndex]->rosterList;
	map<time_t, time_t>::iterator iter_date;
	map<time_t, time_t> mpRange = Utility::GetInstancePtr()->getDateRangeFromLong(strUnit, strPeriod, this->_dbData->scenario.startDtUTC, this->_dbData->scenario.endDtUTC + 24 * 3600, weekdayStartFrom);
	for (iter_date = mpRange.begin(); iter_date != mpRange.end(); ++iter_date)
	{
		vector<SharedPtr<ROSTER>> rostersTemp;
		for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
		{
			if (((*roster)->actStrUtc >= (*iter_date).first && (*roster)->actStrUtc <= (*iter_date).second + 24 * 3600) ||
				((*roster)->actRestStrUtc >= (*iter_date).first && (*roster)->actRestStrUtc <= (*iter_date).second + 24 * 3600))
			{
				rostersTemp.push_back((*roster));
			}
		}

		int iCurrentRoster = Utility::GetInstancePtr()->getFirstAttributeRoster(rostersTemp, strAttribute);
		int iFirst = iCurrentRoster;

		//int iNextRoster = getNextAttributeRoster(rostersTemp, iCurrentRoster, strAttribute);
		double iNumberOfAttribute = 0.0;
		//if (iCurrentRoster != FAILURE) iNumberOfAttribute++;
		int iNextRoster = iCurrentRoster;
		time_t startRosterUtc, endRosterUTC;
		//while ((iCurrentRoster != FAILURE) && (iNextRoster != FAILURE))
		while (iNextRoster != FAILURE)
		{
			startRosterUtc = rostersTemp[iNextRoster]->actStrUtc;
			endRosterUTC = rostersTemp[iNextRoster]->actRestStrUtc;
			if (strDests == "*")
			{
				if ((startRosterUtc < (*iter_date).first && endRosterUTC >= (*iter_date).first) ||
					(startRosterUtc <= (*iter_date).second + 24 * 3600 && endRosterUTC >(*iter_date).second + 24 * 3600))
					iNumberOfAttribute = iNumberOfAttribute + 0.5;
				else
					iNumberOfAttribute++;
			}
			else
			{
				if (rostersTemp[iNextRoster]->pairing)
				{
					vector<Duty *> duties = rostersTemp[iNextRoster]->pairing->getDutyVec();
					for (vector<Duty *>::iterator duty = duties.begin(); duty != duties.end(); duty++)
					{
						vector<Segment*> segments = (*duty)->getSegments();
						isFound = false;
						for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); segment++)
						{
							string arrStation = (*segment)->getArrStation();
							if (std::find(strDestinations.begin(), strDestinations.end(), arrStation) != strDestinations.end())
							{
								//iNumberOfAttribute++;
								if ((startRosterUtc < (*iter_date).first && endRosterUTC >= (*iter_date).first) ||
									(startRosterUtc <= (*iter_date).second + 24 * 3600 && endRosterUTC >(*iter_date).second + 24 * 3600))
									iNumberOfAttribute = iNumberOfAttribute + 0.5;
								else
									iNumberOfAttribute++;
								isFound = true;
								break;
							}
						}
						if (isFound)
							break;
					}
				}
			}

			iCurrentRoster = iNextRoster;
			iNextRoster = Utility::GetInstancePtr()->getNextAttributeRoster(rostersTemp, iCurrentRoster, strAttribute);
		}
		if (iNumberOfAttribute > dMax)
		{
			isValid = false;
			string msg = "The number of (" + Utility::GetInstancePtr()->dToa(iNumberOfAttribute)+") roster with attribute(" + strAttribute + ") is more than the maximum allowed(" + strMax + ")";
			msg += " at destinations(" + strDests + ").";
			SharedPtr<CREW> ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
			this->setLegalityMessage(ppCrew, pCrew, singleRule, msg);
			pCrew->isLegal = false;
			pCrew->skipCheckInLaterIterations = true;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
			//rv->rosterId = (*iter_roster)->rosterId;
			//rv->pairingId = (*iter_roster)->pairId;
			//rv->dutySequenceNumber = (*duty_iter)->getDutySegNum();
			//rv->segmentId = (*seg_iter)->getDBId();
			rv->startDTUtc = rostersTemp[iFirst]->actStrUtc;
			rv->endDTUtc = endRosterUTC;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("iNumberOfAttribute", Utility::GetInstancePtr()->dToa(iNumberOfAttribute)));
			rv->operation_result.insert(pair<string, string>("strAttribute", strAttribute));
			rv->operation_result.insert(pair<string, string>("strMax", strMax));
			rv->operation_result.insert(pair<string, string>("strDests", strDests));
			rv->violation_msg = msg;
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER){
				return false;
			}
		}

	}

	return isValid;
}

