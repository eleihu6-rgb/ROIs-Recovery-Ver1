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

/* Change Log
# 2023.11.9  Enhancement for Alliance to support RP (roster Period) by SGQ
  
*/

// MIN_CONSECUTIVE_DO = 8024
bool LegalityChecker::checkMinConsecutiveDaysOff(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	auto& parameter = singleRule->params;
	//DO ASSIGNMENT GROUP,MIN TIMES,CONSECUTIVE DAYS,PERIOD,UNIT,UTILIZE POST DUTY REST,COUNT BLANK DAY
	//OFF,1,2,1,CM,Y,Y
	map<string, string>::const_iterator iter;
	string header, headeValue;
	/*
	rWeekEnd 
	 N  - N/A
	 F  - Fully Weekend including Sat and Sunday (CONSECUTIVE DAYS  >=2） 
	 P  - Partial Weekend including Sat and Sunday, must have one of Sat and Sun.
	*/
	string rDOGroup, rMinTimes, rConsecutiveDays, rPeriod, rUnit, rWeekEnd="N";
	bool bPostRest, bBlankDay, bIsSplit = true;

	string dbg = "";
	string weekdayStartFrom = this->getCrewContext()->getWeekdayStartFrom();
	try {

		dbg = "loop parameter";
		for (iter = parameter.begin(); iter != parameter.end(); iter++)
		{
			header = iter->first;
			headeValue = iter->second;

			dbg = headeValue;

			if (header == "DO ASSIGNMENT GROUP")
				rDOGroup = headeValue;
			if (header == "MIN TIMES")
				rMinTimes = headeValue;
			if (header == "CONSECUTIVE DAYS")
				rConsecutiveDays = headeValue;
			if (header == "PERIOD")
				rPeriod = headeValue;
			if (header == "UNIT")
				rUnit = headeValue;
			if (header == "UTILIZE POST DUTY REST")
				bPostRest = (headeValue == "Y");
			if (header == "COUNT BLANK DAY")
				bBlankDay = (headeValue == "Y");
			if (header == "IS SPLIT")
				bIsSplit = (headeValue.empty() || headeValue == "*") ? true : (headeValue == "Y");
			if (header == "WEEKEND MODE")
				rWeekEnd = headeValue;
		}

		///////////////////
		dbg = "loop assignment";
		vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
		string airlinecode = this->_dbData->scenario.airline;
		vector<string> daysOffs;// , restAssignments;
		for (vector<SharedPtr<DBRule_8014>>::iterator assignment = assignments.begin(); assignment != assignments.end(); assignment++)
		{
			if ((*assignment)->assignmentGroup == rDOGroup && (this->_dbData->version == 3 || (*assignment)->airline == airlinecode))
			{
				daysOffs.push_back((*assignment)->assignemnt);
			}
			if ((*assignment)->assignmentGroup == "REST"  && (this->_dbData->version == 3 || (*assignment)->airline == airlinecode))
				daysOffs.push_back((*assignment)->assignemnt);
				//restAssignments.push_back((*assignment)->assignemnt);
		}
		dbg = "compute start/end time";
		SharedPtr<CREW> crew=this->_dbData->crewList[pCrew->crewIndex];
		vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

		
		string crewid = crew->idCrew;
		

		time_t rollingWindow_start, rollingWindow_end;
		if (this->GetApplication() != ROSTER_OPTIMIZER && !rosters.empty())
		{
			rollingWindow_start = rosters[0]->actStrUtc;
			rollingWindow_end = rosters[rosters.size() - 1]->actEndUtc;
		}
		else
		{
			rollingWindow_start = this->_dbData->scenario.startDtUTC;
			rollingWindow_end = this->_dbData->scenario.endDtUTC + 24 * 3600;
		}
		dbg = "cast rPeriod";
		int period = stoi(rPeriod);
		dbg = "cast iConsecutive->rConsecutiveDays";
		int iConsecutive = stoi(rConsecutiveDays);
		if (iConsecutive < 1)
			iConsecutive = 1;

		dbg = "cast rMinTimes";
		int iRequiredDO = stoi(rMinTimes);
		if (rosters.size() == 0)
			return true;
		time_t tempStart = rosters[0]->actEndUtc;
		dbg = "compute base";
		string base = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, tempStart);
		int offsetMinutes = 0;
		if (base.empty())
			base = crew->baseList[0]->base;
		if (!base.empty())
			offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
		if (rUnit == "CM")
		{
			dbg = "CM";
			map<time_t, time_t> mp = Utility::GetInstancePtr()->getMonthRollingWindows(rollingWindow_start, rollingWindow_end, offsetMinutes, period);
			for (map<time_t, time_t>::iterator mp_it = mp.begin(); mp_it != mp.end(); mp_it++)
			{
				time_t start = (*mp_it).first;
				time_t end = (*mp_it).second;
				int iDaysOff;
				if (!bBlankDay)
					iDaysOff = Utility::GetInstancePtr()->howManyAssignmentsInRange(rosters, daysOffs, start, end, iConsecutive, bIsSplit);
				else
					//iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRange(rosters, restAssignments, daysOffs, offset, bPostRest, start, end, iConsecutive);
					iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, daysOffs, start, end, offsetMinutes, bBlankDay, bPostRest, this->_dbData->airportCodeMap, "", iConsecutive, false, "", bIsSplit, rWeekEnd);

				if (iDaysOff < iRequiredDO)
				{
					dbg = "cast iDaysOff";
					string msg = "The number of consecutive " + rConsecutiveDays + " days off(" + Utility::GetInstancePtr()->ToString(iDaysOff) + ") must be at least " + rMinTimes;
					dbg = "make msg";
					msg += " in " + rPeriod + " " + rUnit ;

					if (rWeekEnd != "" && rWeekEnd != "*")
					{
						msg += "WeekMode("+rWeekEnd+")";
					}
					msg += ".";

					pCrew->legalMessage.push_back(msg);
					this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
					pCrew->isLegal = false;
					bReturn = false;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = crewid;
					//if (crewid == "0000092246")
					//	printf("");
					//rv->rosterId = (*roster)->rosterId;
					//rv->pairingId = (*roster)->pairId;
					//rv->dutySequenceNumber = (*duty)->getDutySegNum();
					//rv->segmentId = (*segment)->getDBId();
					rv->startDTUtc = start;
					rv->endDTUtc = end;
					rv->violation_msg = msg;
					rv->type = VIOLATION_TYPE::CREW_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("rConsecutiveDays", rConsecutiveDays));
					rv->operation_result.insert(pair<string, string>("iDaysOff", Utility::GetInstancePtr()->ToString(iDaysOff)));
					rv->operation_result.insert(pair<string, string>("rMinTimes", rMinTimes));
					rv->operation_result.insert(pair<string, string>("rPeriod", rPeriod));
					rv->operation_result.insert(pair<string, string>("rUnit", rUnit));
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER){
						return false;
					}
				}
			}
		}
		else if (rUnit == "CW")
		{
			map<time_t, time_t> mp = Utility::GetInstancePtr()->getWeeksRollingWindows(rollingWindow_start - (period * 7 - 1) * 24 * 3600, rollingWindow_end + (period * 7 - 1) * 24 * 3600, weekdayStartFrom, offsetMinutes, period);
			for (map<time_t, time_t>::iterator mp_it = mp.begin(); mp_it != mp.end(); mp_it++)
			{
				time_t start = (*mp_it).first;
				time_t end = (*mp_it).second;
				int iDaysOff;
				if (!bBlankDay)
					iDaysOff = Utility::GetInstancePtr()->howManyAssignmentsInRange(rosters, daysOffs, start, end, iConsecutive, bIsSplit);
				else
					//iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, daysOffs, start, end, offset, bBlankDay, bPostRest, iConsecutive, false, "", bIsSplit);
					iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, daysOffs, start, end, offsetMinutes, bBlankDay, bPostRest, this->_dbData->airportCodeMap, "", iConsecutive, false, "", bIsSplit, rWeekEnd);
				if (iDaysOff < iRequiredDO)
				{
					dbg = "cast iDaysOff";
					string msg = "The number of consecutive " + rConsecutiveDays + " days off(" + Utility::GetInstancePtr()->ToString(iDaysOff) + ") must be at least " + rMinTimes;
					dbg = "make msg";
					msg += " in " + rPeriod + " " + rUnit + ".";
					pCrew->legalMessage.push_back(msg);
					this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
					pCrew->isLegal = false;
					bReturn = false;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
					rv->startDTUtc = start;
					rv->endDTUtc = end;
					rv->violation_msg = msg;
					rv->type = VIOLATION_TYPE::CREW_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("rConsecutiveDays", rConsecutiveDays));
					rv->operation_result.insert(pair<string, string>("iDaysOff", Utility::GetInstancePtr()->ToString(iDaysOff)));
					rv->operation_result.insert(pair<string, string>("rMinTimes", rMinTimes));
					rv->operation_result.insert(pair<string, string>("rPeriod", rPeriod));
					rv->operation_result.insert(pair<string, string>("rUnit", rUnit));
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER){
						return false;
					}
				}
			}
		}
		//支持QQ航空公司RP时间范围（固定28天范围）
		else if (rUnit == "RP")
		{
			for (auto& rp : this->_dbData->rosterPeriodList)
			{
				if (Utility::GetInstancePtr()->isTimeOverlap(rp.rp_start, rp.rp_end, rollingWindow_start, rollingWindow_end))
				{
					//假设为基地本地时
					time_t start = rp.rp_start;
					//假设结束日期为当日23:59
					time_t end = rp.rp_end + 24*60*60;
					//转换成Crew基地本地时间开始、结束日期，offsetMinutes
					start = start - offsetMinutes * 60 - (period - 1) * 28 * 24 * 60 * 60;
					end = end - offsetMinutes * 60 ;

					int iDaysOff;
					if (!bBlankDay)
						iDaysOff = Utility::GetInstancePtr()->howManyAssignmentsInRange(rosters, daysOffs, start, end, iConsecutive, bIsSplit);
					else
						iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, daysOffs, start, end, offsetMinutes, bBlankDay, bPostRest, this->_dbData->airportCodeMap, "", iConsecutive, false, "", bIsSplit, rWeekEnd);
					if (iDaysOff < iRequiredDO)
					{
						dbg = "cast iDaysOff";
						string msg = "The number of consecutive " + rConsecutiveDays + " days off(" + Utility::GetInstancePtr()->ToString(iDaysOff) + ") must be at least " + rMinTimes;
						dbg = "make msg";
						msg += " in " + rPeriod + " " + rUnit + ".";
						pCrew->legalMessage.push_back(msg);
						this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
						pCrew->isLegal = false;
						bReturn = false;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
						rv->startDTUtc = start;
						rv->endDTUtc = end;
						rv->violation_msg = msg;
						rv->type = VIOLATION_TYPE::CREW_VIOLATION;
						rv->operation_result.insert(pair<string, string>("rConsecutiveDays", rConsecutiveDays));
						rv->operation_result.insert(pair<string, string>("iDaysOff", Utility::GetInstancePtr()->ToString(iDaysOff)));
						rv->operation_result.insert(pair<string, string>("rMinTimes", rMinTimes));
						rv->operation_result.insert(pair<string, string>("rPeriod", rPeriod));
						rv->operation_result.insert(pair<string, string>("rUnit", rUnit));
						this->addRuleViolations(rv, singleRule);
						if (this->GetApplication() == ROSTER_OPTIMIZER) {
							return false;
						}
					}
				}
			}

		}
		else if (rUnit == "CD")
		{
			dbg = "CD";

			//mantis 6185
			if (this->GetApplication() == ROSTER_OPTIMIZER)
				rollingWindow_start = rollingWindow_start - (period + 1) * 24 * 3600;

			map<time_t, time_t> mp = Utility::GetInstancePtr()->getDaysRollingWindows(rollingWindow_start, rollingWindow_end, offsetMinutes, period);
			for (map<time_t, time_t>::iterator mp_it = mp.begin(); mp_it != mp.end(); mp_it++)
			{
				time_t start = (*mp_it).first;
				time_t end = (*mp_it).second;

				int iDaysOff;
				if (!bBlankDay)
					iDaysOff = Utility::GetInstancePtr()->howManyAssignmentsInRange(rosters, daysOffs, start, end, iConsecutive, bIsSplit);
				else
					//iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRange(rosters, restAssignments, daysOffs, offset, bPostRest, start, end, iConsecutive);
					//iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, daysOffs, start, end, offset, bBlankDay, bPostRest, iConsecutive, false, "", bIsSplit);
					iDaysOff = Utility::GetInstancePtr()->howManyDaysOffInRanges(rosters, daysOffs, start, end, offsetMinutes, bBlankDay, bPostRest, this->_dbData->airportCodeMap, "", iConsecutive, false, "", bIsSplit, rWeekEnd);

				bool hasROAssignedRosterInRange = Utility::GetInstancePtr()->hasROAssignedRosterInRange(rosters, start, end);

				//For Roster_Optimizer, if the violations in the time range are all from pre-assignments, then ignore
				if ((iDaysOff < iRequiredDO && this->GetApplication() != ROSTER_OPTIMIZER)
					|| (iDaysOff < iRequiredDO && this->GetApplication() == ROSTER_OPTIMIZER && hasROAssignedRosterInRange))
				{
					dbg = "cast iDaysOff";
					string msg = "The number of consecutive " + rConsecutiveDays + " days off(" + Utility::GetInstancePtr()->ToString(iDaysOff) + ") must be at least " + rMinTimes;
					dbg = "make msg";
					msg += " in " + rPeriod + " " + rUnit + ".";
					pCrew->legalMessage.push_back(msg);
					this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
					pCrew->isLegal = false;
					bReturn = false;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
					//if (crewid == "0000092246")
					//	printf("");
					//rv->rosterId = (*roster)->rosterId;
					//rv->pairingId = (*roster)->pairId;
					//rv->dutySequenceNumber = (*duty)->getDutySegNum();
					//rv->segmentId = (*segment)->getDBId();
					rv->startDTUtc = start;
					rv->endDTUtc = end;
					rv->violation_msg = msg;
					rv->type = VIOLATION_TYPE::CREW_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("rConsecutiveDays", rConsecutiveDays));
					rv->operation_result.insert(pair<string, string>("iDaysOff", Utility::GetInstancePtr()->ToString(iDaysOff)));
					rv->operation_result.insert(pair<string, string>("rMinTimes", rMinTimes));
					rv->operation_result.insert(pair<string, string>("rPeriod", rPeriod));
					rv->operation_result.insert(pair<string, string>("rUnit", rUnit));
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER){
						return false;
					}
				}
			}
		}

	}
	catch (exception& ex) {
		Logger::getRuleLogger()->error("exception:{}, dbg={}", ex.what(), dbg);
		bReturn = false;
	}
	return bReturn;

}