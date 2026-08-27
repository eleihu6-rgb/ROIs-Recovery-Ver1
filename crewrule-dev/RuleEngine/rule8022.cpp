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
#include "utils/TimeUtils.h"
#include "TimezoneUtils.h"
#include "utils/CompetenceValidationUtils.h"


bool LegalityChecker::checkRecency(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string strDefinition, strValue;

	string rRank, rFleet, rAiport, rOperate, rRequiredTimes, rRecencyPeriod, rUnit, rEnroute = "*", rQual = "*";
	bool bUseProjected;
	//RANK,FLEET,AIRPORT,OPERATE,REQUIRED TIMES,RECENCY PERIOD,UNIT,USE PROJECTED DATA
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "RANK")
			rRank = headeValue;
		if (header == "FLEET")
			rFleet = headeValue;
		if (header == "USE PROJECTED DATA")
			bUseProjected = (headeValue == "Y");
		if (header == "AIRPORT")
			rAiport = headeValue;
		if (header == "OPERATE")
			rOperate = headeValue;
		if (header == "REQUIRED TIMES")
			rRequiredTimes = headeValue;
		if (header == "RECENCY PERIOD")
			rRecencyPeriod = headeValue;
		if (header == "UNIT")
			rUnit = headeValue;
		if (header == "ENROUTE")
			rEnroute = headeValue;
		if (header == "QUALIFICATION")
			rQual = headeValue;
	}
	if (rAiport.size() == 0)
		return true;
	int iRequiredTimes = stoi(rRequiredTimes);
	int iRequiredDays = 0;
	iRequiredDays = stoi(rRecencyPeriod);
	vector<string> qualifications;
	split(rQual, '|', qualifications);

	//mantis#1958, 数据结构改为 unordered_set<recency>
	shared_ptr<CREW>& crew = this->_dbData->crewList[pCrew->crewIndex];
	string crewId = crew->idCrew;
	map<string, RecencyMapWithHashAndEqual>& recenciesmap = this->_dbData->recencyMgr.getRecencyMap();
	auto it = recenciesmap.find(crewId);
	RecencyMapWithHashAndEqual recencies;
	if (it != recenciesmap.end())
		recencies = (*it).second;

	vector<string> enrouteAirportList;
	if (rEnroute != "*") {
		const auto& airports = this->_dbData->airportList;
		for (const auto& airport : airports) {
			if (airport.icRoute == rEnroute) {
				enrouteAirportList.push_back(airport.airport);
			}
		}
	}

	vector<SharedPtr<CREW_MANDAY_FD>>& cfd = crew->mandayFdList;
	vector<SharedPtr<CREW_MANDAY_CC_AM>>& cabin = crew->mandayCcAmList;

	string crewid = crew->idCrew;
	bool isFd = (crew->division == "P");

	vector<SharedPtr<ROSTER>>& rosters = this->_dbData->crewList[pCrew->crewIndex]->rosterList;
	for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); roster++)
	{
		string actingRank = (*roster)->actingRank;

		if (rRank != actingRank && rRank != "*")
			continue;

		if (!(*roster)->pairing)
			continue;
		vector<Duty *> duties = (*roster)->pairing->getDutyVec();
		for (vector<Duty *>::iterator duty = duties.begin(); duty != duties.end(); duty++)
		{
			vector<Segment*> segments = (*duty)->getSegments();
			for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); segment++)
			{
				if (!(*segment)->getIsOperating())
					continue;
				string fleet = (*segment)->getFleetCD();
				if (rFleet != fleet && rFleet != "*")
					continue;
				time_t start = (*segment)->getStartTimeUtcAct();
				time_t end = (*segment)->getEndTimeUtcAct();
				string dep = (*segment)->getDepStation();
				string arr = (*segment)->getArrStation();

				if (!rAiport.empty() && rAiport != "*" && rAiport != dep && rAiport != arr) {
					continue;
				}

				/*if (rEnroute != "*") {
					if (find(enrouteAirportList.begin(), enrouteAirportList.end(), dep) == enrouteAirportList.end()
						&& find(enrouteAirportList.begin(), enrouteAirportList.end(), arr) == enrouteAirportList.end())
						continue;
							
				}*/

				if (rQual != "*") {
					const auto& crewQualifications = crew->qualificationList;
					bool hasQual = false;
					for (const auto& q : qualifications) {
						for (const auto& qual : crewQualifications) {
							if (qual->qual == q) {
								if (CompetenceValidationUtils::IsValid(qual, start, end)) {
									hasQual = true;
									break;
								}
								/*time_t qualStart = qual->issuedUtc;
								time_t qualEnd = qual->expiryUtc;
								if (qualEnd < 0)
									qualEnd = end + 24 * 3600;
								if (qual->expiryUtc && qualStart <= start && qualEnd >= end && qual->isValid) {
									hasQual = true;
									break;
								}*/
							}
						}
						if (hasQual)
							break;
					}
					if (hasQual)
						continue;
				}

				time_t recencyWindowStartUtc = 0;
				if (rUnit == "CD") {
					recencyWindowStartUtc = start - iRequiredDays * 24 * 3600;
				}
				else if (rUnit == "MS") {
					const auto& startOfMonth = Utility::GetInstancePtr()->getLocalMonthStartInUTC(start, 0);
					recencyWindowStartUtc = TimeUtils::AddMonth(startOfMonth, 0, -1 * iRequiredDays);
				}
				else if (rUnit == "CY") {
					recencyWindowStartUtc = TimeUtils::AddMonth(start, 0, -12 * iRequiredDays);
				}

				int iRecency = 0;
				int enrouteRecency = 0;

				string depZoneId = this->_dbData->getAirportZoneId(dep);
				const auto& offset = TimezoneUtils::GetTimezoneOffset(start, depZoneId);
				const auto& startOfDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(start, offset);

				if (isFd) {
					for (const auto& manday : cfd) {
						if (manday->crewDateUtc < recencyWindowStartUtc || manday->crewDateUtc >= startOfDay)
							continue;

						for (std::map<string, int>::iterator iter = manday->operating_airports.begin(); iter != manday->operating_airports.end(); iter++) {
							if (rAiport == iter->first) {
								iRecency += iter->second;
							}
							if (rEnroute != "*") {
								if (find(enrouteAirportList.begin(), enrouteAirportList.end(), this->_dbData->airportCodeMap[iter->first]->icRoute) != enrouteAirportList.end())
									enrouteRecency += iter->second;
							}

						}
						
						if (iRecency >= iRequiredTimes || enrouteRecency >= iRequiredTimes)
							break;
					}
				}
				else {
					for (const auto& manday : cabin) {
						if (manday->crewDateUtc < recencyWindowStartUtc || manday->crewDateUtc >= startOfDay)
							continue;

						for (std::map<string, int>::iterator iter = manday->operating_airports.begin(); iter != manday->operating_airports.end(); iter++) {
							if (rAiport == iter->first) {
								iRecency += iter->second;
							}
							if (rEnroute != "*") {
								if (find(enrouteAirportList.begin(), enrouteAirportList.end(), this->_dbData->airportCodeMap[iter->first]->icRoute) != enrouteAirportList.end())
									enrouteRecency += iter->second;
							}

						}

						if (iRecency >= iRequiredTimes || enrouteRecency >= iRequiredTimes)
							break;
					}
				}
				

				if ((rAiport != "*" && iRecency < iRequiredTimes) || (rEnroute != "*" && enrouteRecency < iRequiredTimes))
				{
					bReturn = false;
					string msg = "The crew member has not met the " + rRequiredTimes + " recency requirement in the last " + rRecencyPeriod + " " + rUnit;
					if (rAiport != "*")
						msg = msg + " in " + rAiport + " ";
					if (rRank != "*")
						msg = msg + " with " + rRank + " ";
					if (rFleet != "*")
						msg = msg + " by " + rFleet + " ";
					if (rEnroute != "*")
						msg = msg + " in Enroute(" + rEnroute + ")";

					pCrew->legalMessage.push_back(msg);
					this->setLegalityMessage((*segment), singleRule, msg);
					pCrew->isLegal = false;

					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = crewId;
					rv->rosterId = (*roster)->rosterId;
					rv->pairingId = (*roster)->pairId;
					rv->dutySequenceNumber = (*duty)->getDutySegNum();
					rv->segmentId = (*segment)->getDBId();
					rv->startDTUtc = (*segment)->getStartTimeUtcAct();
					rv->endDTUtc = (*segment)->getEndTimeUtcAct();
					rv->violation_msg = msg;
					rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("rRecencyPeriod", rRecencyPeriod));
					rv->operation_result.insert(pair<string, string>("rUnit", rUnit));
					rv->operation_result.insert(pair<string, string>("rRequiredTimes", rRequiredTimes));
					rv->operation_result.insert(pair<string, string>("rOperate", rOperate));
					rv->operation_result.insert(pair<string, string>("rAiport", rAiport));
					rv->operation_result.insert(pair<string, string>("rRank", rRank));
					rv->operation_result.insert(pair<string, string>("rFleet", rFleet));
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER){
						return false;
					}
				}

						

			}
		}
		
	}
	return bReturn;
}
