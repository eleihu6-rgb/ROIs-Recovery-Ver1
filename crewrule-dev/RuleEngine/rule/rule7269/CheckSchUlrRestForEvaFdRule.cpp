#include "../../RuleEngine.h"
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
#include "../utils/StringUtils.h"
#include "../utils/SchDutyUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"

extern bool block_cmp(const DBRule& rule1, const DBRule& rule2);

/*
* 7269作为8015的分身，通过计划时间检查MinRest
*/
bool LegalityChecker::checkSchULRRest_ForEvaFd(RULE_LEGALITY* pCrew, const DBRule* singleRule)
{
	DBG_HELP("LegalityChecker::checkSchULRRest_ForEvaFd");

	bool bReturn = true;

	//ULR is a duty or roster
	bool bULRIsRoster = true;

	rule7269* cache = (rule7269*)singleRule->parsedParam.get();
	//table2：REST TYPE,MIN REST LENGTH,MIN CALENDAR DAYS,MIN LOCAL NIGHTS,LOCATION
	string strRestType = cache->strRestType;
	string strMinRest = cache->strMinRest;
	string strMinCalDays = cache->strMinCalDays;
	string strMinLocalNights = cache->strMinLocalNights;
	string strLocationBase = cache->strLocationBase;
	string strExceptionCode = cache->exceptionCode;
	vector<string> exceptionCodeList = cache->exceptionCodeList;
	vector<string> exceptionAssignmentGroups = cache->exceptionAssignmentGroups;
	//table1： definition parameters
	//string strMaxSector = cache->strMaxSector;   //20180112 ain: 新增7269 Max Sector
	//string strMinFlightTime = cache->strMinFlightTime; //20180112 ain: 新增7269 Min Flight Time
	//string strMinFDP = cache->strMinFDP; //20180112 ain: 新增7269 Min FDP
	//string strQualifier = cache->strStandbys;
	//int iMaxSector = cache->iMaxSector;//20180112 ain: 新增7269 Min FDP

	//string strLabel = cache->strLabels; 

	//vector<string> strLabels, strQualifiers;
	//split(strLabel, '|', strLabels);
	//split(strQualifier, '|', strQualifiers);
	vector<DBRule> rules = this->_dbData->getRuleFunctions(RULES::SCH_ULR_REST_CHECK_FOR_EVA_FD);
	stable_sort(rules.begin(), rules.end(), block_cmp);
	map<string, string>::const_iterator iter;
	string header, headeValue;
	for (auto& rule : rules)
	{
		if (rule.tableNum == 2)
			continue;
		map<string, string> parameter = rule.params;

		for (iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;

			if (header == "EXCEPTION CODE") {
				strExceptionCode = headeValue;
				split(strExceptionCode, '|', exceptionCodeList);
				break;
			}
		}
		break;
	}
	int iMinRest = cache->iMinRest;
	int iRequiredCalDays = cache->iRequiredCalDays;
	int iLocalsRequired = cache->iMinLocalNights;
	int iNights = cache->iMinLocalNights;
	transform(strRestType.begin(), strRestType.end(), strRestType.begin(), ::toupper);
	//definition rules
	if (strRestType.length() < 1)
		return true;
	Local_Night_Definition local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();
	if (local_night.LocalEnd.empty() && local_night.LocalStart.empty())
	{
		Logger::getRuleLogger()->error("Exception::No local night definition rules (rule 2014).");
		return true;
	}
	int localNightStart = TimeUtils::hhmmToMinutes(local_night.LocalStart);
	int localNightEnd = TimeUtils::hhmmToMinutes(local_night.LocalEnd);
	int localNightInterval = TimeUtils::hhmmToMinutes(local_night.MinRestInterval);

	string base = this->_dbData->crewList[pCrew->crewIndex]->baseList.at(0)->base;
	//OP1489
	int offsetMinutes = 0;
	if (this->_dbData->scenario.airline != "BR")
		offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	else
		offsetMinutes = this->_dbData->getAirportOffsetMinutes("TPE");
	vector<SharedPtr<ROSTER>>& rosters = this->_dbData->crewList[pCrew->crewIndex]->rosterList;
	string restBase = "*";
	if (strLocationBase == "CREW BASE") {
		restBase = base;
		offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	}

	if ((strRestType == "PRE-ULR") || (strRestType == "POST-ULR") || (strRestType == "LAYOVER"))
	{
		vector<string> exceptionAssignments;
		if (exceptionAssignmentGroups.size() > 0 && exceptionAssignmentGroups[0] != "*" && exceptionAssignmentGroups[0] != "") {
			for (const auto& group : exceptionAssignmentGroups) {
				const auto& list = this->_dbData->getAssignmentsInGroup(group);
				exceptionAssignments.insert(exceptionAssignments.end(), list.begin(), list.end());
			}
		}
		if (strRestType == "LAYOVER") {
			bULRIsRoster = false;
		}

		for (auto it_roster = rosters.begin(); it_roster != rosters.end(); ++it_roster)
		{
			//0002738: 7269新增LABEL欄位
			/*
			string label = (*it_roster)->label;
			string qualifier = (*it_roster)->qualifier;
			if (
			!
			(
			(
			(strLabel == "*") ||
			(strLabel != "*" && find(strLabels.begin(), strLabels.end(), label) != strLabels.end())
			)
			||
			(
			(strQualifier == "*") ||
			(strQualifier != "*" && find(strQualifiers.begin(), strQualifiers.end(), qualifier) != strQualifiers.end())
			)
			)
			)
			continue;
			*/
			if (strLocationBase == "PTN BASE")
			{
				restBase = (*it_roster)->location;
				offsetMinutes = this->_dbData->getAirportOffsetMinutes(restBase);
			}
			if ((*it_roster)->pairing)
			{
				// check exception code
				if (strExceptionCode != "" && strExceptionCode != "*") {
					bool foundCode = false;
					for (const auto& duty : (*it_roster)->pairing->getDutyVec()) {
						for (const auto& seg : duty->getSegments()) {
							const auto& rf = this->_dbData->rosterFlightMgr.get(seg->getDBId(), (*it_roster)->idcrew);
							if (rf == nullptr)
								continue;
							if (rf->tsFlag == "" || rf->tsFlag.size() == 0)
								continue;
							if (find(exceptionCodeList.begin(), exceptionCodeList.end(), rf->tsFlag) != exceptionCodeList.end()) {
								foundCode = true;
								break;
							}
						}
						if (foundCode)
							break;
					}
					if (foundCode)
						continue;

				}

				int iDutyIndex = -1;
				//vector<Duty *> duties = (*it_roster)->pairing->getDutyVec();
				//for (vector<Duty*>::iterator it_duty = duties.begin(); it_duty != duties.end(); ++it_duty)
				for (std::size_t iDutyIndex = 0; iDutyIndex < (*it_roster)->pairing->getNumDuties(); iDutyIndex++)
				{
					//Duty::DUTY_TYPE dt = (*it_duty)->getType();
					//iDutyIndex++;
					Duty* duty = (*it_roster)->pairing->getDuty(iDutyIndex);

					//当前Duty没有货机机型，则不用按计划时间进行检查
					if (!SchDutyUtils::existFleetsInDuty(duty)) {
						continue;
					}

					//if (dt != Duty::DUTY_PAIRING_REST && dt != Duty::DUTY_BLANK_DAY && ((*it_duty)->isULR()))
					if (duty->isULR())
					{
						//int iNights = stoi(strMinLocalNights);
						time_t start = SchDutyUtils::GetDutySchStartTimeUtc(duty);
						time_t end = SchDutyUtils::GetDutySchEndTimeUtc(duty);
						int iMode = 0;
						time_t DayStart = 0;
						if (bULRIsRoster)
							start = (*it_roster)->actStrUtc;

						if (strLocationBase == "REST LOCATION")
						{
							restBase = duty->getDepStation();
							offsetMinutes = this->_dbData->getAirportOffsetMinutes(restBase);
						}

						if (strRestType == "PRE-ULR")
						{
							time_t anotherTime1 = start - iMinRest * 60;//anotherTime1 最迟休息开始时间点(用于检查Min Rest Length,Min Calendar Days参数)
							DayStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(start, offsetMinutes);
							time_t anotherTime2 = DayStart - iRequiredCalDays * 24 * 60 * 60;
							if (anotherTime1 > anotherTime2)
								anotherTime1 = anotherTime2;
							time_t otherStartTm = 0; //实际休息开始时间(用于检查Min Rest Length,Min Calendar Days参数)
							int i = -1;
							for (i = 0; i != rosters.size(); i++)
							{
								if ((rosters[i]->pairing) && rosters[i]->pairId == (*it_roster)->pairId)
								{
									break;
								}
							}
							if (i > 0)
							{
								for (int j = i - 1; j != -1; j--)
								{
									bool bRest = false;
									if (exceptionAssignmentGroups.size() > 0 && exceptionAssignmentGroups[0] != "*" && exceptionAssignmentGroups[0] != "") {
										if ((find(exceptionAssignments.begin(), exceptionAssignments.end(), rosters[j]->qualifier) != exceptionAssignments.end())) {
											bRest = true;
										}
									}

									if (!bRest && RuleParams::GetInstancePtr()->isRestAssignment(rosters[j]->qualifier, rosters[j]->duty)) {
										bRest = true;
									}
	
									if (bRest)
										continue;

									if ((*it_roster)->needRuleCheck == false && rosters[j]->needRuleCheck == false && this->GetApplication() == ROSTER_OPTIMIZER)
										continue;

									if (j == i - 1 && rosters[j]->duty == "RB" && rosters[j]->actRestStrUtc >= (*it_roster)->actStrUtc)
									{
										// 抓飛, 把ULR任務開始時間改成待命開始時間
										start = rosters[j]->actStrUtc;
										continue;
									}
									otherStartTm = rosters[j]->actRestStrUtc;
									break;
								}
							}
							if (!bULRIsRoster && iDutyIndex > 0)
								otherStartTm = (*it_roster)->pairing->getDuty(iDutyIndex - 1)->getEndTimeUtcAct();

							//检查有几个连续local nights。这些local nights无需在连续的REST里。
							//根据local nighs，得到REST开始结算时间的列表
							//it_roster1 = it_roster;Z
							time_t roster_start = (*it_roster)->actStrUtc;
							time_t rosterDayStart;
							rosterDayStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(roster_start, offsetMinutes);
							time_t restStartAtMost = rosterDayStart - (iNights + 1) * 24 * 60 * 60;
							vector<Rest_Ranges*> rests = Utility::GetInstancePtr()->getRestRanges(rosters, restStartAtMost, roster_start, {}, true, "*");

							int localNights = Utility::GetInstancePtr()->hasXConsecutiveLocalNightsBeforeTm(rests, iLocalsRequired, roster_start, local_night, offsetMinutes);

							if ((localNights < iLocalsRequired) || (otherStartTm > anotherTime1))
							{
								if (this->_application == ROSTER_OPTIMIZER && (*it_roster)->source == "PA" && !((*it_roster)->needRuleCheck))
									if (!(Utility::GetInstancePtr()->hasROAssignedRosterInRange(rosters, restStartAtMost, roster_start))) {
										//20180123 ain, mantis#2765, mem leak
										for (auto& rest : rests) {
											delete rest;
										}
										rests.clear();
										continue;
									}
								bReturn = false;
								stringstream ss;
								ss << "The rest before the ULR roster doesn't contain " << strMinLocalNights << " consecutive local nights or is less than ";
								ss << strMinRest << " hours and " << strMinCalDays << " calendar days.";
								string msg = ss.str();
								this->setLegalityMessage((*it_roster), pCrew, singleRule, msg);
								pCrew->isLegal = false;
								RULE_VIOLATION* rv = new RULE_VIOLATION();
								rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
								rv->rosterId = (*it_roster)->rosterId;
								rv->pairingId = (*it_roster)->pairId;
								rv->dutySequenceNumber = duty->getDutySegNum();
								rv->startDTUtc = restStartAtMost;
								rv->endDTUtc = roster_start;
								rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
								//OP#1448提供message参数给gantt
								rv->operation_result.insert(pair<string, string>("afterOrBefore", "before"));
								rv->operation_result.insert(pair<string, string>("strMinLocalNights", strMinLocalNights));
								rv->operation_result.insert(pair<string, string>("strMinRest", strMinRest));
								rv->operation_result.insert(pair<string, string>("strMinCalDays", strMinCalDays));
								rv->violation_msg = msg;
								this->addRuleViolations(rv, singleRule);
								if (this->GetApplication() == ROSTER_OPTIMIZER)
								{
									//20180123 ain, mantis#2765, mem leak
									for (auto& rest : rests) {
										delete rest;
									}
									rests.clear();
									return false;
								}
							}

							//delete rests
							for (vector<Rest_Ranges*>::iterator it = rests.begin(); it != rests.end(); ++it)
							{
								if (NULL != *it)
								{
									delete* it;
									*it = NULL;
								}
							}
							rests.clear();

						}
						if (strRestType == "POST-ULR")
						{
							if ((*it_roster)->duty != "FLY")
								continue;

							vector<SharedPtr<ROSTER>>::iterator it_roster1 = it_roster;

							it_roster1++;

							if (it_roster1 != rosters.end() && Utility::GetInstancePtr()->isHalfRoster((*it_roster1)))
							{
								end = (*it_roster1)->actRestStrUtc;
								if (it_roster1 != rosters.end()) {
									it_roster1++;
								}
							}

							time_t anotherTime1 = end + (iMinRest) * 60;
							time_t DayStart = Utility::GetInstancePtr()->getLocalDayStartInUTC(end, offsetMinutes);
							int iRequiredPlusDay = 0;
							if (DayStart != end) {
								// mantis#4649, 若直接把iRequiredCalDays++, 第二個ULR會出錯
								//iRequiredCalDays++;
								iRequiredPlusDay = 1;
							}
							time_t anotherTime2 = DayStart + (iRequiredCalDays + iRequiredPlusDay) * 24 * 60 * 60;
							if (anotherTime1 < anotherTime2)
								anotherTime1 = anotherTime2;

							time_t anotherTime3 = Utility::GetInstancePtr()->getRestByNumberOfLocalNights(end, iNights, local_night, offsetMinutes);
							if (anotherTime1 < anotherTime3)
								anotherTime1 = anotherTime3;

							for (; it_roster1 != rosters.end(); ++it_roster1)
							{
								bool bRest = false;
								if (exceptionAssignmentGroups.size() > 0 && exceptionAssignmentGroups[0] != "*" && exceptionAssignmentGroups[0] != "") {
									if ((find(exceptionAssignments.begin(), exceptionAssignments.end(), (*it_roster1)->qualifier) != exceptionAssignments.end())) {
										bRest = true;
									}
								}

								if (!bRest && RuleParams::GetInstancePtr()->isRestAssignment((*it_roster1)->qualifier, (*it_roster1)->duty)) {
									bRest = true;
								}

								if (bRest)
									continue;

								if ((*it_roster)->needRuleCheck == false && (*it_roster1)->needRuleCheck == false && this->_application == ROSTER_OPTIMIZER)
									continue;
								//post ULR local nights must be consecutive. Different to pre ulr
								if ((*it_roster1)->actStrUtc < anotherTime1)
								{
									bReturn = false;
									stringstream ss;
									ss << "The rest after the ULR is less than " << strMinRest << " hours inclusive " << strMinCalDays << " calendar days with " << strMinLocalNights << " local nights";
									string msg = ss.str();
									this->setLegalityMessage(duty, pCrew, singleRule, msg);
									pCrew->isLegal = false;
									RULE_VIOLATION* rv = new RULE_VIOLATION();
									rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
									rv->rosterId = (*it_roster)->rosterId;
									rv->pairingId = (*it_roster)->pairId;
									rv->dutySequenceNumber = duty->getDutySegNum();
									rv->startDTUtc = SchDutyUtils::GetDutySchStartTimeUtc(duty);
									rv->endDTUtc = SchDutyUtils::GetDutySchEndTimeUtc(duty);
									rv->violation_msg = msg;
									rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
									//OP#1448提供message参数给gantt
									rv->operation_result.insert(pair<string, string>("afterOrBefore", "after"));
									rv->operation_result.insert(pair<string, string>("strMinRest", strMinRest));
									rv->operation_result.insert(pair<string, string>("strMinCalDays", strMinCalDays));
									rv->operation_result.insert(pair<string, string>("strMinLocalNights", strMinLocalNights));
									this->addRuleViolations(rv, singleRule);
									if (this->GetApplication() == ROSTER_OPTIMIZER) {
										return false;
									}
									//break at next work duty
									break;
								}

							}
						}
						if (strRestType == "LAYOVER") {
							if (iDutyIndex == 0)
								continue;
							const auto& prevDuty = (*it_roster)->pairing->getDuty(iDutyIndex - 1);
							const auto& checkStart = SchDutyUtils::GetDutySchEndTimeUtc(prevDuty) + (time_t)prevDuty->getMinDropoff() * 60;
							const auto& checkEnd = SchDutyUtils::GetDutySchStartTimeUtc(duty) - (time_t)duty->getMinPickup() * 60;
							int localNight = DutyUtils::GetLocalNightNums(checkStart, checkEnd, offsetMinutes, local_night.LocalStart, local_night.LocalEnd, local_night.MinRestInterval);
							if (checkEnd - checkStart < iMinRest * 60 || localNight < iLocalsRequired) {

								if ((*it_roster)->needRuleCheck == false && this->_application == ROSTER_OPTIMIZER)
									continue;
								//post ULR local nights must be consecutive. Different to pre ulr

								bReturn = false;
								stringstream ss;
								ss << "The rest before the ULR duty doesn't contain " << strMinLocalNights << " consecutive local nights or is less than ";
								ss << strMinRest << " hours and " << strMinCalDays << " calendar days.";
								string msg = ss.str();
								this->setLegalityMessage(duty, pCrew, singleRule, msg);
								pCrew->isLegal = false;
								RULE_VIOLATION* rv = new RULE_VIOLATION();
								rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
								rv->rosterId = (*it_roster)->rosterId;
								rv->pairingId = (*it_roster)->pairId;
								rv->dutySequenceNumber = duty->getDutySegNum();
								rv->startDTUtc = SchDutyUtils::GetDutySchStartTimeUtc(duty);
								rv->endDTUtc = SchDutyUtils::GetDutySchEndTimeUtc(duty);
								rv->violation_msg = msg;
								rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
								//OP#1448提供message参数给gantt
								rv->operation_result.insert(pair<string, string>("afterOrBefore", "before"));
								rv->operation_result.insert(pair<string, string>("strMinRest", strMinRest));
								rv->operation_result.insert(pair<string, string>("strMinCalDays", strMinCalDays));
								rv->operation_result.insert(pair<string, string>("strMinLocalNights", strMinLocalNights));
								this->addRuleViolations(rv, singleRule);
								if (this->GetApplication() == ROSTER_OPTIMIZER) {
									return false;
								}
								//break at next work duty
								break;

							}
						}

					}
				}
			}
		}
	}

	return bReturn;
}
