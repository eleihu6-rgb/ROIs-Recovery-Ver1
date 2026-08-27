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
#include "utils/StringUtils.h"

//MAX_DAYS_AWAYFROM_BASE2
//8637 MAX_DAYS_AWAYFROM_BASE2
bool LegalityChecker::checkMaxDaysAwayFromBase2(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	rule8637* cache = (rule8637*)singleRule->parsedParam.get();
	string rBase = cache->crewBase;
	int iMaxDaysOutOfBase = cache->maxDaysOutOfBase;
	string rLocation = cache->location;
	int iMaxInLocationDays = cache->maxDaysInLocation;

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;

	time_t lScenarioStart = this->_dbData->scenario.startDtUTC;
	time_t lScenarioEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;

	bool bIsBase = false;
	string sBase = rBase;
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
	bool isAlreadyViolate = false; //从某日期开始只警告一次
	for (auto& roster : rosters)
	{
		//if (roster->idcrew == "324" && roster->actStrUtc >= 1563649500)
		//	printf("");
		bool foundViolation = false;
		time_t arriveLocationDtUtc = lastArriveDayStartUtc;
		time_t leaveLocationDtUtc = 0;
		int offsetMinutesOfLastLocation = offsetMinutes;

		if (roster->pairId == 0)
		{
			time_t rosterEndDtUc = getLocalDayStartInUTC(roster->actEndUtc, offsetMinutes);
			if (lastLocation == rLocation && roster->location != rBase
				&& rosterEndDtUc - lastArriveDayStartUtc >= 24 * 3600 * iMaxInLocationDays//'>=' including start/end date
				&& !isAlreadyViolate)
			{
				leaveLocationDtUtc = rosterEndDtUc;
				isAlreadyViolate = true;
				foundViolation = true;
			}
			//0006341: [8637] 把地面任务也纳入分析离开基地的时间
			//说明Crew已经回到Base，重置数值
			else if (roster->location == rBase)
			{
				lastArriveDayStartUtc = rosterEndDtUc;
				isAlreadyViolate = false;
				foundViolation = false;
				lastLocation = roster->location;
			}
		}
		else
		{

			Segment* firstSeg = roster->pairing->getFirstSegment();
			Segment* lastSeg = roster->pairing->getLastSegment();

			//20190723 ain, mantis#6286, 容忍ptn/duty为空
			if (firstSeg) {

				leaveLocationDtUtc = getLocalDayStartInUTC(firstSeg->getStartTimeUtcAct(), offsetMinutes);//local 00:00 in utc

				if (lastLocation == rLocation
					&& leaveLocationDtUtc - lastArriveDayStartUtc >= iMaxInLocationDays * 24 * 3600//'>=' including start/end date
					&& !isAlreadyViolate)
				{
					foundViolation = true;
					isAlreadyViolate = true;
				}

				//for next loop
				lastLocation = lastSeg->getArrStation();
				offsetMinutes = _dbData->getAirportOffsetMinutes(lastSeg->getArrStation());
				lastArriveDayStartUtc = getLocalDayStartInUTC(lastSeg->getEndTimeUtcAct(), offsetMinutes);//local 00:00 in utc
				isAlreadyViolate = false;//for next date period check
			}
		}
		//rule msg
		if (foundViolation)
		{
			if (this->_application == ROSTER_OPTIMIZER)
			{
				if (!(Utility::GetInstancePtr()->isTimeOverlap(arriveLocationDtUtc, leaveLocationDtUtc, this->_dbData->scenario.startDtUTC, this->_dbData->scenario.endDtUTC)))
					continue;
			}

			bReturn = false;
			string msg = "The crew member has stayed at {0:rLocation} for more than {1:leaveLocationDtUtcMinusArriveLocationDtUtc} days in a row (from {2:arriveLocationDtUtcAddOffsetHourOfLastLocation} to {3:leaveLocationDtUtcAddOffsetHourOfLastLocation}).";
			msg = StringUtils::Format(msg, rLocation, (1 + (leaveLocationDtUtc - arriveLocationDtUtc) / (24 * 3600)), utcToUtcDtString(arriveLocationDtUtc + offsetMinutesOfLastLocation * 60), utcToUtcDtString(leaveLocationDtUtc + offsetMinutesOfLastLocation * 60));

			this->setLegalityMessage(roster, pCrew, singleRule, msg);
			pCrew->isLegal = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("rLocation", rLocation));
			rv->operation_result.insert(pair<string, string>("leaveLocationDtUtcMinusArriveLocationDtUtc", Utility::GetInstancePtr()->iToa(1 + static_cast<int>(leaveLocationDtUtc - arriveLocationDtUtc) / (24 * 3600))));
			rv->operation_result.insert(pair<string, string>("arriveLocationDtUtcAddOffsetHourOfLastLocation ", utcToUtcDtString(arriveLocationDtUtc + offsetMinutesOfLastLocation * 60)));
			rv->operation_result.insert(pair<string, string>("leaveLocationDtUtcAddOffsetHourOfLastLocation", utcToUtcDtString(leaveLocationDtUtc + offsetMinutesOfLastLocation * 60)));
			rv->crewId = roster->idcrew;
			rv->rosterId = roster->rosterId;
			rv->startDTUtc = arriveLocationDtUtc;
			rv->endDTUtc = roster->actStrUtc;
			rv->violation_msg = msg;
			rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER){
				return false;
			}
		}
	}

	//max days out of crew_base
	for (auto roster = rosters.begin(); roster != rosters.end(); ++roster)
	{
		if (this->_application == ROSTER_OPTIMIZER)
		{
			if ((*roster)->source != "CR")
				continue;
			if ((*roster)->restStrUtc < this->_dbData->scenario.startDtUTC)
				continue;
		}
		if ((*roster)->getBase() == rBase && ((*roster)->pairing))
		{
			Pairing* pairing = (*roster)->pairing;

			if (pairing->getEndArp() == pairing->getBase())
				continue;

			long long rosterId = (*roster)->rosterId;
			time_t roster_end = (*roster)->actEndUtc;

			bool bFindAnotherBalancedRoster = false;
			for (auto next_roster = rosters.begin(); next_roster != rosters.end(); next_roster++)
			{
				if ((*next_roster)->actStrUtc > (*roster)->actEndUtc && ((*next_roster)->pairing))
				{
					Pairing* nextPairing = (*next_roster)->pairing;

					if (nextPairing->getEndArp() != rBase)
						continue;

					bFindAnotherBalancedRoster = true;
					auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(rBase);
					time_t startDay = Utility::GetInstancePtr()->getLocalDayStartInUTC((*roster)->actStrUtc, offsetMinutes);
					time_t endDay = Utility::GetInstancePtr()->getLocalDayStartInUTC((*next_roster)->restStrUtc, offsetMinutes);
					int outOfBaseDay = static_cast<int>(endDay - startDay) / (24 * 3600) + 1;
					if (outOfBaseDay > iMaxDaysOutOfBase)
					{
						bReturn = false;
						if (this->_application == ROSTER_OPTIMIZER)
						{
							if ((*next_roster)->source != "CR")
								continue;
						}

						string msg = "The number of days the crew member has stayed away from base ({0:outOfBaseDay}) exceeds the maximum of {1:iMaxDaysOutOfBase} days.";
						msg = StringUtils::Format(msg, outOfBaseDay, iMaxDaysOutOfBase);

						this->setLegalityMessage((*roster), pCrew, singleRule, msg);
						pCrew->isLegal = false;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = (*roster)->idcrew;
						rv->rosterId = (*roster)->rosterId;
						rv->startDTUtc = (*roster)->actStrUtc;
						rv->endDTUtc = (*next_roster)->actStrUtc;
						rv->violation_msg = msg;
						rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("ActDaysOutOfBase", Utility::GetInstancePtr()->ToString(outOfBaseDay)));
						rv->operation_result.insert(pair<string, string>("iMaxDaysOutOfBase", Utility::GetInstancePtr()->iToa(iMaxDaysOutOfBase)));
						this->addRuleViolations(rv, singleRule);
						if (this->GetApplication() == ROSTER_OPTIMIZER){
							return false;
						}
					}
					break;
				}
			}

			if (!bFindAnotherBalancedRoster)
			{
				bReturn = false;
				string msg = "The roster assignment is unbalanced.";
				this->setLegalityMessage((*roster), pCrew, singleRule, msg);
				pCrew->isLegal = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = (*roster)->idcrew;
				rv->rosterId = (*roster)->rosterId;
				//rv->pairingId = (*roster)->pairId;
				//rv->dutySequenceNumber = (*duty)->getDutySegNum();
				//rv->segmentId = (*segment)->getDBId();
				rv->startDTUtc = (*roster)->actStrUtc;
				rv->endDTUtc = (*roster)->actEndUtc;
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