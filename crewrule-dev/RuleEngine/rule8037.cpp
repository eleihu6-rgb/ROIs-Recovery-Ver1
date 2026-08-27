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
// #include "customBiz\customBiz.h"
#include "CustomBiz/CustomBiz.h"
#include "RuleParams.h"


//MAX_DAYS_AWAYFROM_BASE
//only apply to expat crew , two half rosters' pattern
//8037 MAX_DAYS_AWAYFROM_BASE
bool LegalityChecker::checkMaxDaysAwayFromBase(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	rule8037* cache = (rule8037*)singleRule->parsedParam.get();
	string rBase = cache->crewBase;
	int iMaxDaysOutOfBase = cache->maxDaysOutOfBase;
	string rLocation = cache->location;
	int iMaxInLocationDays = cache->maxDaysInLocation;

	vector<SharedPtr<ROSTER>>& rosters = this->_dbData->crewList[pCrew->crewIndex]->rosterList;
	vector<SharedPtr<CREW_BASE>>& bases = this->_dbData->crewList[pCrew->crewIndex]->baseList;
	SharedPtr<CREW>& crew = this->_dbData->crewList[pCrew->crewIndex];
	time_t lScenarioStart = this->_dbData->scenario.startDtUTC;
	time_t lScenarioEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;

	bool bIsBase = false;
	string sBase = rBase;
	//for (vector<SharedPtr<CREW_BASE>>::iterator base = bases.begin(); base != bases.end(); base++)
	for (auto& item : bases)
	{
		if (item->base == rBase)
		{
			if (item->effUtc <= lScenarioStart && (item->expUtc == NULL || item->expUtc < 0 || item->expUtc >= lScenarioEnd))
			{
				bIsBase = true;
			}
		}
	}

	if (!bIsBase)
		return true;

	if (rosters.empty())
		return true;

	//max days in location
	//1) 遍历roster, 每当到达新location时记录为lastLocation和到达日期 lastArriveDayStartUtc
	//2) 因segment切换location后重新记录 lastLocation, lastArriveDayStartUtc
	//3) 若roster.pairing为null, 检查endDt - lastArriveDayStartUtc > maxDaysInLocation
	//4) 若roster.pairing存在, 检查firstSegment.startDt - lastArriveDayStartUtc > maxDaysInLocation
	auto offsetMinutes = _dbData->getAirportOffsetMinutes(rosters[0]->location);
	time_t lastArriveDayStartUtc = getLocalDayStartInUTC(rosters[0]->actStrUtc, offsetMinutes); //local 00:00 in utc
	string lastLocation = rosters[0]->location;
	time_t strTime = 0, strTimeTest = rosters[0]->actRestStrUtc;
	time_t endTime = rosters[0]->actRestStrUtc;
	bool isAlreadyViolate = false; //从某日期开始只警告一次
	for (auto& roster : rosters) {
		bool foundViolation = false;
		strTime = strTimeTest;
		time_t arriveLocationDtUtc = lastArriveDayStartUtc;
		time_t leaveLocationDtUtc = 0;
		int offsetMinutesOfLastLocation = offsetMinutes;

		if (roster->pairId == 0) {
			time_t rosterEndDtUc = getLocalDayStartInUTC(roster->actEndUtc, offsetMinutes);
			if (lastLocation == rLocation
				&& rosterEndDtUc - lastArriveDayStartUtc > 24 * 3600 * iMaxInLocationDays//'>=' including start/end date
				&& !isAlreadyViolate)
			{
				endTime = roster->actStrUtc;
				leaveLocationDtUtc = rosterEndDtUc;
				isAlreadyViolate = true;
				foundViolation = true;
			}
		}
		else {

			//Segment* firstSeg = roster->pairing->getFirstSegment();
			Segment* lastSeg = roster->pairing->getLastSegment();
			//20190723 ain, mantis#6286, 容忍 ptn/duty为空
			if (lastSeg) {
				leaveLocationDtUtc = getLocalDayStartInUTC(roster->actStrUtc, offsetMinutes);//local 00:00 in utc
				endTime = roster->actStrUtc;
				if (lastLocation == rLocation
					&& leaveLocationDtUtc - lastArriveDayStartUtc > iMaxInLocationDays * 24 * 3600//'>=' including start/end date
					&& !isAlreadyViolate)
				{
					foundViolation = true;
					isAlreadyViolate = true;
				}

				//for next loop
				lastLocation = lastSeg->getArrStation();
				strTimeTest = roster->actRestStrUtc;
				offsetMinutes = _dbData->getAirportOffsetMinutes(lastSeg->getArrStation());
				lastArriveDayStartUtc = getLocalDayStartInUTC(roster->actRestStrUtc, offsetMinutes);//local 00:00 in utc
				isAlreadyViolate = false;//for next date period check
			}
		}

		//rule msg
		if (foundViolation) {
			bReturn = false;
			stringstream ss;
			ss << "Crew has stayed in " << rLocation << " for more than "
				<< (1 + (leaveLocationDtUtc - arriveLocationDtUtc) / (24 * 3600))   //+1 day for including start/end date
				<< " days in a row (From " << utcToMMDDHHmmString(arriveLocationDtUtc)
				<< " to " << utcToMMDDHHmmString(leaveLocationDtUtc) << ")";
			string msg = ss.str();
			this->setLegalityMessage(roster, pCrew, singleRule, msg);
			pCrew->isLegal = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("rLocation", rLocation));
			rv->operation_result.insert(pair<string, string>("days", Utility::GetInstancePtr()->iToa(iMaxInLocationDays)));
			rv->operation_result.insert(pair<string, string>("arriveLocationDtUtc", utcToMMDDHHmmString(strTime + offsetMinutes * 60)));
			rv->operation_result.insert(pair<string, string>("leaveLocationDtUtc", utcToMMDDHHmmString(endTime + offsetMinutes * 60)));
			rv->crewId = roster->idcrew;
			rv->rosterId = roster->rosterId;
			//			rv->startDTUtc = arriveLocationDtUtc;
			//			rv->endDTUtc = roster->actStrUtc;
			rv->startDTUtc = strTime;
			rv->endDTUtc = endTime;
			rv->violation_msg = msg;
			rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER){
				return false;
			}
		}
	}


	//max days out of crew_base
	for (auto roster = rosters.begin(); roster != rosters.end(); roster++)
	{
		offsetMinutes = crew->crewBaseTimezoneOffsetIndex->getOffsetMinutes((*roster)->actStrUtc);
		if ((*roster)->getBase() == rBase && ((*roster)->pairing))
		{
			//vector<Duty*> duties = (*roster)->pairing->getDutyVec();
			//if ((duties.size() != 1) || (duties.size() == 0))
			//	continue;
			Pairing* pairing = (*roster)->pairing;
			if (pairing->getNumDuties() != 1)
				continue;
			Duty* duty = (*roster)->pairing->getDuty(0);
			//vector<Segment*> segments = duty->getSegments();
			//if (segments.size() != 1)
			if (duty->getNumSegments() != 1)
				continue;
			//string arrStation = segments[0]->getArrStation();
			Segment* seg = duty->getSegment(0);
			string arrStation = seg->getArrStation();
			if (seg->getDepStation() == arrStation)
				continue;

			long long rosterId = (*roster)->rosterId;
			time_t roster_end = (*roster)->actEndUtc;

			bool bFindAnotherHalfRoster = false;
			for (auto next_roster = rosters.begin(); next_roster != rosters.end(); next_roster++)
			{
				if ((*next_roster)->actStrUtc > (*roster)->actEndUtc && ((*next_roster)->pairing))
				{
					//vector<Duty*> next_duties = (*next_roster)->pairing->getDutyVec();
					Pairing* nextPairing = (*next_roster)->pairing;
					//if ((next_duties.size() != 1) || (next_duties.size() == 0))
					//单duty任务才可能不换基地
					if (nextPairing->getNumDuties() != 1)
						continue;
					Duty* nextDuty = nextPairing->getDuty(0);
					//vector<Segment*> next_segments = next_duties[0]->getSegments();
					//if (next_segments.size() != 1)
					if (nextDuty->getNumSegments() != 1)
						continue;

					Segment* nextSeg = nextDuty->getSegment(0);
					string next_depStation = nextSeg->getDepStation();
					string next_arrStation = nextSeg->getArrStation();

					//if (arrStation != next_depStation)
					//	continue;
					if (next_arrStation != rBase)
						continue;

					bFindAnotherHalfRoster = true;

					int outOfBaseTime = static_cast<int>((*next_roster)->restStrUtc - (*roster)->actStrUtc);
					if ((outOfBaseTime > iMaxDaysOutOfBase * 24 * 60 * 60) && (Utility::GetInstancePtr()->isHalfRoster((*next_roster))) && (Utility::GetInstancePtr()->isHalfRoster((*roster))))
					{
						bReturn = false;
						string tempTime = Utility::GetInstancePtr()->formatMinutesToDays(outOfBaseTime / 60);
						stringstream ss;
						ss << "The time the crew has stayed away from base (From" << utcToMMDDHHmmString((*roster)->actStrUtc) << "to" << utcToMMDDHHmmString((*next_roster)->restStrUtc) << ") exceeds " << iMaxDaysOutOfBase << " days.";
						string msg = ss.str();
						this->setLegalityMessage((*roster), pCrew, singleRule, msg);
						pCrew->isLegal = false;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = (*roster)->idcrew;
						rv->rosterId = (*roster)->rosterId;
						rv->startDTUtc = (*roster)->actStrUtc;
						rv->endDTUtc = (*next_roster)->actRestStrUtc;
						rv->violation_msg = msg;
						rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("tempTime", tempTime));
						rv->operation_result.insert(pair<string, string>("strTime", utcToMMDDHHmmString((*roster)->actStrUtc + offsetMinutes * 60)));
						rv->operation_result.insert(pair<string, string>("endTime", utcToMMDDHHmmString((*next_roster)->actRestStrUtc + offsetMinutes * 60)));
						rv->operation_result.insert(pair<string, string>("iMaxDaysOutOfBase", Utility::GetInstancePtr()->iToa(iMaxDaysOutOfBase)));
						this->addRuleViolations(rv, singleRule);
						if (this->GetApplication() == ROSTER_OPTIMIZER){
							return false;
						}
					}
					break;
				}
			}

			if (!bFindAnotherHalfRoster)
			{
				bReturn = false;
				string msg = "The roster is an unbalanced half roster.";
				this->setLegalityMessage((*roster), pCrew, singleRule, msg);
				pCrew->isLegal = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = (*roster)->idcrew;
				rv->rosterId = (*roster)->rosterId;
				//rv->pairingId = (*roster)->pairId;
				//rv->dutySequenceNumber = (*duty)->getDutySegNum();
				//rv->segmentId = (*segment)->getDBId();
				rv->startDTUtc = (*roster)->actStrUtc;
				rv->endDTUtc = (*roster)->actRestStrUtc;
				rv->violation_msg = msg;
				rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER){
					return false;
				}
			}

		}
	}

	return bReturn;
}