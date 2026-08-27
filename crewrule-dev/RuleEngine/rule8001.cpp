#pragma once

#include "RuleEngine.h"

#include "TimezoneUtils.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>
#include <cstdio>
#include <cstdarg>
#include <climits>
#include "CrewDB.h"
#include "UtilFunc.h"

// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/PhaseUtils.h"

using namespace std;
bool cmp8001(WORKDUTY_TIMES * m1, WORKDUTY_TIMES * m2)  {
	return m1->startUtcTime < m2->startUtcTime;
}
//check min rest 48 hours in any 168 rolling hours
//1	8001001	1	,	min_rest,period,period define	48:00,168,RH
bool LegalityChecker::checkMinRestIn7Days(RULE_LEGALITY * pPairing, const DBRule* singleRule)
{
	DBG_HELP("LegalityChecker::checkMinRestIn7Days");

	/////TEST
	//printf("checkMinRestIn7Days crewIndex=%d PairingIndex=%d \n", pPairing->crewIndex, pPairing->PairingIndex);
	//if (0 < pPairing->PairingIndex && pPairing->PairingIndex < this->_dbData->pairingList.size()) {
	//	printf("                    pairing: %d\n", this->_dbData->pairingList[pPairing->PairingIndex]->getDbId());
	//}
	//else {
	//	printf("                    pairing: index out of range\n");
	//}
	//if (0 < pPairing->crewIndex && pPairing->crewIndex < (int)this->_dbData->crewList.size()) {
	//	printf("                    crew: %s\n", this->_dbData->crewList[pPairing->crewIndex]->idCrew.c_str());
	//}
	//else {
	//	printf("                    crwe: index out of range\n");
	//}
	/////TEST

	bool isValid = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string min_rest, period, period_type, strBase, strRank, strFleet;
	bool isCountLayover = false;
	string earlyWarningTimeRange;
	int earlyWarningStartTimeHHmm = -1, earlyWarningEndTimeHHmm = -1;//最后一天满足休息的预警时，最后一个任务完成时间的开始时间和结束时间分钟数
	vector<string> earlyWarningAssignments;
	string restTimesStr = "*", restPeriodStr = "*";
	//BASE,RANK,FLEET,MIN_REST,PERIOD,PERIOD DEFINE,UTILIZE LAYOVER
	//BASES,RANKS,FLEETS,MIN LIMITS,PERIOD,UNIT,UTILIZE LAYOVER
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		//transform(header.begin(), header.end(), header.begin(), ::toupper);
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "BASES")
			strBase = headeValue;
		if (header == "RANKS")
			strRank = headeValue;
		if (header == "FLEETS")
			strFleet = headeValue;

		if (header == "MIN LIMITS") min_rest = headeValue;
		if (header == "PERIOD")  period = headeValue;
		if (header == "UNIT") period_type = headeValue;

		if (header == "UTILIZE LAYOVER")
			isCountLayover = (headeValue == "Y");

		if (header == "EARLY WARNING TIME RANGE") {
			earlyWarningTimeRange = headeValue;

			vector<string> splitstrs;
			split(earlyWarningTimeRange.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				earlyWarningStartTimeHHmm = hhmmToMinutes(splitstrs[0].c_str());
				earlyWarningEndTimeHHmm = hhmmToMinutes(splitstrs[1].c_str());
			}
		}

		if (header == "EARLY WARNING ASSIGNMENTS") {
			split(headeValue.c_str(), '|', earlyWarningAssignments);
		}

		if (header == "REST TIMES") {
			restTimesStr = headeValue;
		}

		if (header == "REST PERIOD") {
			restPeriodStr = headeValue;
		}
	}

	int iPeriod = stoi(period);
	int iMinRest = 0;
	std::size_t iPos = min_rest.find(":");
	if (iPos != string::npos)
		iMinRest = stoi(min_rest.substr(0, iPos)) * 60 + stoi(min_rest.substr(iPos + 1));
	else
		return true;

	int restTimes = 0;
	if (!restTimesStr.empty() && restTimesStr != "*") {
		restTimes = stoi(restTimesStr);
	}
	int restPeriodStart = 0, restPeriodEnd = 0;
	std::size_t index = restPeriodStr.find("-");
	if (index != string::npos) {
		restPeriodStart = hhmmStrToMinutes(restPeriodStr.substr(0, index));
		restPeriodEnd = hhmmStrToMinutes(restPeriodStr.substr(index + 1));
	}

	SharedPtr<CREW> crew = this->_dbData->crewList[pPairing->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	vector<SharedPtr<CREW_BASE>>& bases = crew->baseList;
	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;
	vector<SharedPtr<CREW_FLEET>>& fleets = crew->fleetList;

	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;
	SharedPtr<CREW_RANK> cofActiveRank = crew->getActiveRankInTimes(lCheckedStart, lCheckedEnd);
	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(bases, lCheckedEnd);
	///TEST
	if (base.empty())
	{
		char utcBuf[100] = { 0 };
		char locBuf[100] = { 0 };
		utcToUtcStr(lCheckedEnd, utcBuf, sizeof(utcBuf));
		if (!bases.empty()) {
			//int offsetMinutes = _dbData->getAirportOffsetMinutes(bases[bases.size() - 1]->base);
			auto& defaultBase = bases.back()->base;
			string zoneId = _dbData->getAirportZoneId(defaultBase);
			auto endLocal = TimezoneUtils::GetLocalTime(lCheckedEnd, zoneId);
			utcToUtcStr(endLocal, locBuf, sizeof(locBuf));
		}
		long long pair_id = 0;
		if (pPairing->PairingIndex >= 0)
			pair_id = this->_dbData->pairingList[pPairing->PairingIndex]->getDbId();
		Logger::getRuleLogger()->error("error: no base available for crew={} on {} (utc:{})  (pair_id={}, index={}) (window={} {})\n",
			_dbData->crewList[pPairing->crewIndex]->idCrew.c_str(), locBuf, utcBuf, pair_id, pPairing->PairingIndex,
			utcToUtcString(lCheckedStart).c_str(), utcToUtcString(lCheckedEnd).c_str());
	}

	auto offsetMinutes = crew->crewBaseTimezoneOffsetIndex->getOffsetMinutes(lCheckedStart);

	time_t rollingWindow_start = 0, rollingWindow_end = 0;
	int iRollingUnit = 60 * 60;
	if (period_type == "RH")
	{
		if (this->GetApplication() == ROSTER_OPTIMIZER && pPairing->RosterIndex >= 0)
		{
			rollingWindow_start = rosters[pPairing->RosterIndex]->actStrUtc - iPeriod * 60 * 60;
			rollingWindow_end = rosters[pPairing->RosterIndex]->actEndUtc + iPeriod * 60 * 60;
		}
		else
		{
			rollingWindow_start = lCheckedStart - iPeriod * 60 * 60;
			rollingWindow_end = lCheckedEnd + iPeriod * 60 * 60;
		}

	}
	else if (period_type == "CD")
	{
		int cd = 24 * 60 * 60;
		if (this->GetApplication() == ROSTER_OPTIMIZER && pPairing->RosterIndex >= 0)
		{

			rollingWindow_start = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[pPairing->RosterIndex]->actStrUtc, offsetMinutes) - iPeriod * cd;
			rollingWindow_end = Utility::GetInstancePtr()->getLocalDayStartInUTC(rosters[pPairing->RosterIndex]->actEndUtc, offsetMinutes) + iPeriod * cd;
		}
		else
		{
			rollingWindow_start = Utility::GetInstancePtr()->getLocalDayStartInUTC(lCheckedStart - iPeriod * cd, offsetMinutes);
			rollingWindow_end = Utility::GetInstancePtr()->getLocalDayStartInUTC(lCheckedEnd + iPeriod * cd, offsetMinutes) + cd;
		}
		iPeriod = iPeriod * 24;
		iRollingUnit = iRollingUnit * 24;
	}

	vector<WORKDUTY_TIMES *> works;
	vector<Duty *> allduty;
	string airlinecode = this->_dbData->scenario.airline;
	for (vector<SharedPtr<ROSTER>>::iterator ix = rosters.begin(); ix != rosters.end(); ++ix)
	{

		Pairing * pg = (*ix)->pairing;

		if ((*ix) != nullptr && !PhaseUtils::IsChecked((*ix).get(), singleRule->phase, this->_dbData)) {
			continue;
		}

		if (RuleParams::GetInstancePtr()->isRestAssignment((*ix)->qualifier, (*ix)->duty))
			continue;

		if (!pg || !isCountLayover)
		{
			WORKDUTY_TIMES* work = new WORKDUTY_TIMES();
			work->startUtcTime = (*ix)->actStrUtc;
			work->endUtcTime = (*ix)->actRestStrUtc;
			work->needRuleCheck = (*ix)->needRuleCheck;
			work->assignment = (*ix)->qualifier;
			work->activity = (*ix).get();//ROSTER指针
			works.push_back(work);
			continue;
		}
		vector<Duty *> dutylist = pg->getDutyVec();
		if (dutylist.empty())
			continue;
		CalculationManday REST = this->_dbData->getCalculationManday("RESTGAP");
		if (isCountLayover)
		{
			for (size_t i = 0; i < dutylist.size(); i++)
			{
				if (RosterUtils::ExistExceptionCode((*ix).get(), dutylist[i], singleRule->exceptionCodes, _dbData)) {
					continue;
				}

				Duty::DUTY_TYPE dt = dutylist[i]->getType();
				time_t start = dutylist[i]->getStartTimeUtc(REST.str) - dutylist[i]->getActualPickupMin() * 60;
				time_t end = dutylist[i]->getEndTimeUtc(REST.end) + dutylist[i]->getActualDropoffMin() * 60;
				if ((start >= rollingWindow_start) && (end <= rollingWindow_end) &&
					(dt != Duty::DUTY_PAIRING_REST) && (dt != Duty::DUTY_BLANK_DAY))
				{
					WORKDUTY_TIMES* work = new WORKDUTY_TIMES();
					work->startUtcTime = start;
					work->endUtcTime = end;
					work->needRuleCheck = (*ix)->needRuleCheck;

					auto& segments = dutylist[i]->getSegmentsRead();
					if (!segments.empty()) {
						work->assignment = segments.back()->getAssignment();
					}
					else {
						work->assignment = dutylist[i]->getAssignment();
					}
		
					work->activity = dutylist[i];//Duty指针
					works.push_back(work);
				}
			}
		}
	}
	if (works.empty()) {
		return true;
	}
	stable_sort(works.begin(), works.end(), cmp8001);
	map<time_t, time_t> mtt = Utility::GetInstancePtr()->getRollingWindows(iPeriod * 60, rollingWindow_start, rollingWindow_end, iRollingUnit);
	for (map<time_t, time_t>::iterator ix = mtt.begin(); ix != mtt.end(); ++ix)
	{	
		//if ((*ix).first > 1555200000 - 1 && (*ix).first < 1555246800)
		//puts("");

		if ((!isValid) && this->GetApplication() == ROSTER_OPTIMIZER)
			break;

		time_t start = (*ix).first;
		time_t end = (*ix).second;
		bool needRuleCheckInRange = false;
		int lastWorksIndex = -1;
		//int iMaxRest = getMaxRestInRange(works, start, end, needRuleCheckInRange);
		vector<REST_TIME> allRestTimes = getMaxRestTimeInRange(lastWorksIndex, works, start, end, needRuleCheckInRange);
		REST_TIME maxRestTime;
		for (auto& rest : allRestTimes) {
			maxRestTime = REST_TIME::GetMax(maxRestTime, rest);
		}
		int iMaxRest = maxRestTime.restMinutes;

		//移除小于iMinRest的休息
		allRestTimes.erase(std::remove_if(allRestTimes.begin(), allRestTimes.end(),
			[iMinRest](const auto& restTime) {
				if (restTime.restMinutes < iMinRest) {
					return true;
				}
				return false;
			}), allRestTimes.end());
		//debug
		//int tmpMaxRest = getMaxRestInRange(works, start, end, needRuleCheckInRange);
		//if (tmpMaxRest != iMaxRest) {
		//	Logger::getRuleLogger()->debug("[ERROR] 8001 failed, ruleId={}, startTimeUtc={}, endTimeUtc={}, iMinRest={}, tmpMaxRest={}, maxRestTime={} {} {}", 
		//		singleRule->idRule, start, end, iMinRest, tmpMaxRest, iMaxRest, maxRestTime.startUtcTime, maxRestTime.endUtcTime);
		//}
		//-debug
		bool bLegal = true;
        // RO时，预占违规不算违规处理
        if (this->GetApplication() == ROSTER_OPTIMIZER && needRuleCheckInRange != true)
        {
            continue;
        }
		if (iMaxRest < iMinRest)
		{
			if (this->GetApplication() == ROSTER_OPTIMIZER)
			{
				if (needRuleCheckInRange == true)
					bLegal = false;
			}
			else
				bLegal = false;
		}
		if (!bLegal)
		{
			char startUtcStr[30] = { 0 };
			char endUtcStr[30] = { 0 };
			time_t maxRestStart = getRestStartInRange(iMaxRest, works, start, end);
			Utility::GetInstancePtr()->UTCToUTCStr(maxRestStart + offsetMinutes * 60, startUtcStr, sizeof(startUtcStr));
			Utility::GetInstancePtr()->UTCToUTCStr(maxRestStart + iMaxRest * 60 + offsetMinutes * 60, endUtcStr, sizeof(endUtcStr));
			//Utility::GetInstancePtr()->UTCToUTCStr(start + offset * 3600, startUtcStr, sizeof(startUtcStr));
			//Utility::GetInstancePtr()->UTCToUTCStr(end - 1 + offset * 3600, endUtcStr, sizeof(endUtcStr));

			isValid = false;
			char maxRest[1024];
			sprintf(maxRest,"%d:%02d", (iMaxRest / 60), (iMaxRest % 60));
			string s = maxRest;
			string msg = "There is only " + s + " hours of rest which is less than < " + min_rest + " hours [";
			msg += string(startUtcStr) + " - " + string(endUtcStr) + "] in this " + period + " " + period_type + ".";
			//string msg = "[" + string(startUtcStr) + " - " + string(endUtcStr) + "] Only " + maxRest;
			//msg += " rest < " + min_rest + " hours in this " + period + " " + period_type + " window.";
			SharedPtr<CREW> ppCrew = (this->_dbData->crewList[pPairing->crewIndex]);
			this->setLegalityMessage(ppCrew, pPairing, singleRule, msg);
			pPairing->isLegal = false;
			pPairing->skipCheckInLaterIterations = true;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = this->_dbData->crewList[pPairing->crewIndex]->idCrew;
			//rv->rosterId = (*it_roster)->rosterId;
			//rv->pairingId = (*it_roster)->pairId;
			//rv->dutySequenceNumber = (*duty)->getDutySegNum();
			//rv->segmentId = (*segment)->getDBId();
			rv->startDTUtc = start;
			rv->endDTUtc = end;
			rv->violation_msg = msg;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
			rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
			rv->operation_result.insert(pair<string, string>("maxRest", maxRest));
			rv->operation_result.insert(pair<string, string>("min_rest", min_rest));
			rv->operation_result.insert(pair<string, string>("period", period));
			rv->operation_result.insert(pair<string, string>("period_type", period_type));
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER){
				ClearVector(WORKDUTY_TIMES, works);
				return false;
			}

		}
		else {
			//满足minrest，进行预警检查。仅针对CD，并且大于等于2天以上
			if (allRestTimes.size() == 1 && period_type == "CD" && iPeriod >= 2*24 && !earlyWarningTimeRange.empty() && earlyWarningTimeRange != "*") {

                bool isCheckEarlyWarning = true;
				if (!earlyWarningAssignments.empty() && lastWorksIndex >= 0 && lastWorksIndex < works.size()) {
					auto& lastAssignment = works[lastWorksIndex]->assignment;
					if (std::find(earlyWarningAssignments.begin(), earlyWarningAssignments.end(), lastAssignment) == earlyWarningAssignments.end()) {
						isCheckEarlyWarning = false;
					}
				}

				if (isCheckEarlyWarning) {
					//检查周期的最后一天
					time_t lastDayEndTimeUtc = end;
					time_t lastDayStartTimeUtc = lastDayEndTimeUtc - (time_t)24 * 60 * 60;

					//检查周期的倒数第二天
					time_t penultimateDayEndTimeUtc = lastDayStartTimeUtc;
					time_t penultimateDayStartTimeUtc = penultimateDayEndTimeUtc - (time_t)24 * 60 * 60;

					time_t earlyWarningStartTimeUtc = penultimateDayStartTimeUtc + (time_t)earlyWarningStartTimeHHmm * 60;
					time_t earlyWarningEndTimeUtc = penultimateDayStartTimeUtc + (time_t)earlyWarningEndTimeHHmm * 60;
					//检查满足休息时长在最后一天，是否需要告警
					if (TimeUtils::IsAbsoluteTimesCovered(maxRestTime.startUtcTime, maxRestTime.endUtcTime, lastDayStartTimeUtc, lastDayEndTimeUtc) //判断满足的休息是否在最后一天
						&& TimeUtils::IsAbsoluteTimesInRange(maxRestTime.startUtcTime, maxRestTime.startUtcTime, earlyWarningStartTimeUtc, earlyWarningEndTimeUtc)) //判断倒数第二天任务结束时间（即休息开始时间）是否在指定范围内
					{
						char startUtcStr[30] = { 0 };
						char endUtcStr[30] = { 0 };
						time_t maxRestStart = maxRestTime.startUtcTime;
						Utility::GetInstancePtr()->UTCToUTCStr(maxRestStart + offsetMinutes * 60, startUtcStr, sizeof(startUtcStr));
						Utility::GetInstancePtr()->UTCToUTCStr(maxRestStart + iMaxRest * 60 + offsetMinutes * 60, endUtcStr, sizeof(endUtcStr));

						isValid = false;
						//在最后一天才满足最小休息时长要求
						string msg = "The minimum rest ({0:min_rest}) hours is met on the last day [{1:startUtcStr}-{2:endUtcStr}] in this {3:period} {4:period_type}.";
						msg = StringUtils::Format(msg, min_rest, string(startUtcStr), string(endUtcStr), period, period_type);
						SharedPtr<CREW> ppCrew = (this->_dbData->crewList[pPairing->crewIndex]);
						this->setLegalityMessage(ppCrew, pPairing, singleRule, msg);
						pPairing->isLegal = false;
						pPairing->skipCheckInLaterIterations = true;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = this->_dbData->crewList[pPairing->crewIndex]->idCrew;
						rv->startDTUtc = start;
						rv->endDTUtc = end;
						rv->violation_msg = msg;
						rv->type = VIOLATION_TYPE::CREW_VIOLATION;
						rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
						rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
						rv->operation_result.insert(pair<string, string>("maxRest", TimeUtils::MinutesTohhmm(maxRestTime.restMinutes)));
						rv->operation_result.insert(pair<string, string>("min_rest", min_rest));
						rv->operation_result.insert(pair<string, string>("period", period));
						rv->operation_result.insert(pair<string, string>("period_type", period_type));
						this->addRuleViolations(rv, singleRule);
						if (this->GetApplication() == ROSTER_OPTIMIZER) {
							ClearVector(WORKDUTY_TIMES, works);
							return false;
						}
					}
				}
			}

			if (!restTimesStr.empty() && restTimesStr != "*" && !restPeriodStr.empty() && restPeriodStr != "*") {
				int num = 0;
				for (auto& rest : allRestTimes) {
					if (rest.restMinutes >= iMinRest) {
						num += TimeUtils::GetTimePeriodNum(rest.startUtcTime + offsetMinutes * 60, rest.endUtcTime + offsetMinutes * 60, restPeriodStart, restPeriodEnd);
					}
				}
				if (num < restTimes) {
					char startUtcStr[30] = { 0 };
					char endUtcStr[30] = { 0 };
					time_t maxRestStart = maxRestTime.startUtcTime;
					Utility::GetInstancePtr()->UTCToUTCStr(maxRestStart + offsetMinutes * 60, startUtcStr, sizeof(startUtcStr));
					Utility::GetInstancePtr()->UTCToUTCStr(maxRestStart + iMaxRest * 60 + offsetMinutes * 60, endUtcStr, sizeof(endUtcStr));

					isValid = false;
					//在最后一天才满足最小休息时长要求
					string msg = "The minimum rest ({0:min_rest}) must include {1:restTimes} rest period ({2:restPeriod}).";
					msg = StringUtils::Format(msg, min_rest, restTimesStr, restPeriodStr);
					SharedPtr<CREW> ppCrew = (this->_dbData->crewList[pPairing->crewIndex]);
					this->setLegalityMessage(ppCrew, pPairing, singleRule, msg);
					pPairing->isLegal = false;
					pPairing->skipCheckInLaterIterations = true;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = this->_dbData->crewList[pPairing->crewIndex]->idCrew;
					rv->startDTUtc = start;
					rv->endDTUtc = end;
					rv->violation_msg = msg;
					rv->type = VIOLATION_TYPE::CREW_VIOLATION;
					rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
					rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
					rv->operation_result.insert(pair<string, string>("restTimes", restTimesStr));
					rv->operation_result.insert(pair<string, string>("restPeriod", restPeriodStr));
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER) {
						ClearVector(WORKDUTY_TIMES, works);
						return false;
					}
				}
			}
		}
	}

	//20190418 ain, mantis#5183, clear mem
	ClearVector(WORKDUTY_TIMES, works);

	return isValid;
}
