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
#include "basicCalculation.h"
#include "TimezoneUtils.h"
#include "../utils/TimeUtils.h"

void updatePatternStatByDate(SharedPtr<CrewDataContext> _dbData, SharedPtr<CREW> crew, vector<SharedPtr<ROSTER>>& rosters, const vector<DBRule>& rules, bool isAddRsoter, time_t start, time_t end)
{
	if (rosters.size() == 0)
		return;
	string ruleParams, att;
	// boolean isMatch = false;
	bool isMatch = false;
	bool isMatchDays = false;

	const auto& base = crew->getPrimeBase();
	const auto& zoneId = _dbData->getAirportZoneId(base);

	int ret = 0, func = 0;
	//BASES,RANKS,FLEETS,CREW TEAMS,ATTRIBUTE,UNIT,PERIOD,MAX TIMES
	string strBases, strRanks, strFleets, strPeriod, strUnit, strTeams = "*", strAttributes, strMax, strDays, strAssignments;
	for (vector<DBRule>::const_iterator rule = rules.begin(); rule != rules.end(); ++rule)
	{
		func = rule->function;
		if (func != RULES::MAX_PTN_BY_DATE)
			continue;
		isMatch = false;

		
		auto& parameter = rule->params;
		//BASES,RANKS,FLEETS,CREW TEAMS,ATTRIBUTE,MAX LIMITS,MIN SPACE,UNIT
		ret = retriveRuleParameter(parameter, "BASES", strBases, true, false); CHECK_RULE_PARAM(ret, func, "BASES");
		ret = retriveRuleParameter(parameter, "RANKS", strRanks, true, false); CHECK_RULE_PARAM(ret, func, "RANKS");
		ret = retriveRuleParameter(parameter, "FLEETS", strFleets, true, false); CHECK_RULE_PARAM(ret, func, "FLEETS");
		ret = retriveRuleParameter(parameter, "CREW TEAMS", strTeams, true, false); CHECK_RULE_PARAM(ret, func, "CREW TEAMS");
		ret = retriveRuleParameter(parameter, "ATTRIBUTES", strAttributes, true, false); CHECK_RULE_PARAM(ret, func, "ATTRIBUTES");
		ret = retriveRuleParameter(parameter, "DAYS", strDays, true, false); CHECK_RULE_PARAM(ret, func, "DAYS");
		ret = retriveRuleParameter(parameter, "ASSIGNMENTS", strAssignments, true, false); CHECK_RULE_PARAM(ret, func, "ASSIGNMENTS");
		
		vector<string> assignments;
		split(strAssignments, '|', assignments);
		if (strAttributes == "*")
			continue;
		ruleParams = to_string(rule->idRule) + "|" + to_string(rule->tableNum) + "|" + to_string(rule->rowNum);
		vector<int> days;
		if (!strDays.empty() && strDays != "*") {
			split(strDays.c_str(), '|', days);
		}

		for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); ++roster)
		{
			isMatch = false;
			isMatchDays = false;
			if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBases, strRanks, strFleets, strTeams, "*", (*roster)->actStrUtc, (*roster)->actRestStrUtc))
				continue;
			if (start != 0 && end != 0)
			{
				//if (!Utility::GetInstancePtr()->isTimeOverlap(start, end, (*roster)->actStrUtc, (*roster)->actRestStrUtc))
				if (!((*roster)->actStrUtc >= start && (*roster)->actStrUtc <= end))
					continue;
			}
			if (!(*roster)->pairing)
				continue;

			if (!strAssignments.empty() && strAssignments != "*" &&
				find(assignments.begin(), assignments.end(), (*roster)->qualifier) == assignments.end())
				continue;
			att = (*roster)->pairing->getAttribute();
			
			if (strAttributes != "*" && att.find(strAttributes) != string::npos)
			{
				isMatch = true;
			}

			const auto & offsetMinutes = TimezoneUtils::GetTimezoneOffset((*roster)->actStrUtc, zoneId);
			const auto & localDayStart = TimeUtils::GetStartTimeOfDay((*roster)->actStrUtc + offsetMinutes * 60);
			const auto & localDD = TimeUtils::GetDay(localDayStart);

			if (strDays.empty() || strDays == "*" || find(days.begin(), days.end(), localDD) != days.end()) {
				isMatchDays = true;
			}

			if (isMatch && isMatchDays)
			{
				if (isAddRsoter)
					RuleStatistics::GetInstancePtr()->addActualPatternByDate(ruleParams, localDayStart, 1);
				else
					RuleStatistics::GetInstancePtr()->addActualPatternByDate(ruleParams, localDayStart, -1);
			}
		}

	}
}


//MAX_PTN_IN_SCENARIO
bool LegalityChecker::checkMaxPatternByDate(RULE_LEGALITY* pCrew, const DBRule* singleRule)
{
	//if (this->_application != ROSTER_OPTIMIZER)
	//	return true;
	bool bReturn = true;
	std::stringstream  ss;
	string strBases, strRanks, strFleets, strDays, strAssignments, strTeams = "*", strAttributes, strMax;
	ss << singleRule->idRule << "|" << singleRule->tableNum << "|" << singleRule->rowNum;
	string ruleParams = ss.str();
	auto& parameter = singleRule->params;
	int func = singleRule->function;
	int ret = retriveRuleParameter(parameter, "BASES", strBases, true, false); CHECK_RULE_PARAM(ret, func, "BASES");
	ret = retriveRuleParameter(parameter, "RANKS", strRanks, true, false); CHECK_RULE_PARAM(ret, func, "RANKS");
	ret = retriveRuleParameter(parameter, "FLEETS", strFleets, true, false); CHECK_RULE_PARAM(ret, func, "FLEETS");
	ret = retriveRuleParameter(parameter, "CREW TEAMS", strTeams, true, false); CHECK_RULE_PARAM(ret, func, "CREW TEAMS");
	ret = retriveRuleParameter(parameter, "ATTRIBUTES", strAttributes, true, false); CHECK_RULE_PARAM(ret, func, "ATTRIBUTES");
	ret = retriveRuleParameter(parameter, "DAYS", strDays, true, false); CHECK_RULE_PARAM(ret, func, "DAYS");
	ret = retriveRuleParameter(parameter, "ASSIGNMENTS", strAssignments, true, false); CHECK_RULE_PARAM(ret, func, "ASSIGNMENTS");
	ret = retriveRuleParameter(parameter, "MAX LIMITS", strMax, true, true); CHECK_RULE_PARAM(ret, func, "MAX LIMITS"); //Max Limits
	vector<string> assignments;
	split(strAssignments, '|', assignments);
	if (strAttributes == "*")
		return true;
	if (pCrew->crewIndex < 0)
		return false;

	vector<int> days;
	if (!strDays.empty() && strDays != "*") {
		split(strDays.c_str(), '|', days);
	}
	bool isMatchDays = false;
	SharedPtr<CREW> crew = _dbData->crewList[pCrew->crewIndex];
	const auto& base = crew->getPrimeBase();
	const auto& zoneId = _dbData->getAirportZoneId(base);
	if (this->GetApplication() == ROSTER_OPTIMIZER) {
		if (pCrew->RosterIndex < 0)
			return false;
		SharedPtr<ROSTER> roster = crew->rosterList[pCrew->RosterIndex];

		if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBases, strRanks, strFleets, strTeams, "*", roster->actStrUtc, roster->actRestStrUtc))
			return true;

		//if (!Utility::GetInstancePtr()->isTimeOverlap(_dbData->scenario.startDtUTC, _dbData->scenario.endDtUTC + 24 * 3600, roster->actStrUtc, roster->actStrUtc))
		if (!(roster->actStrUtc >= _dbData->scenario.startDtUTC && roster->actStrUtc <= _dbData->scenario.endDtUTC + 24 * 3600))
			return true;

		if (!roster->pairing)
			return true;

		if (!strAssignments.empty() && strAssignments != "*" &&
			find(assignments.begin(), assignments.end(), roster->qualifier) == assignments.end())
			return true;

		string att = roster->pairing->getAttribute();
		
		const auto& offsetMinutes = TimezoneUtils::GetTimezoneOffset(roster->actStrUtc, zoneId);
		const auto& localDayStart = TimeUtils::GetStartTimeOfDay(roster->actStrUtc + offsetMinutes * 60);
		const auto& localDD = TimeUtils::GetDay(localDayStart);

		if (strDays.empty() || strDays == "*" || find(days.begin(), days.end(), localDD) != days.end()) {
			isMatchDays = true;
		}

		if (strAttributes != "*" && att.find(strAttributes) != string::npos && isMatchDays)
		{
			int iMax = stoi(strMax);
			int iActual = RuleStatistics::GetInstancePtr()->getActualPatternByDate(ruleParams, localDayStart);
			//cout << "iActual: " << iActual << endl;
			if (iActual > iMax)
			{
				string msg = "The number of pairings(" + Utility::GetInstancePtr()->iToa(iActual) + ") with attribute(" + strAttributes + ") on (" + TimeUtils::Format(localDayStart) + ") exceeds (" + strMax + ").";
				pCrew->legalMessage.push_back(msg);
				this->setLegalityMessage(roster, pCrew, singleRule, msg);
				pCrew->isLegal = false;
				bReturn = false;
				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
				rv->rosterId = roster->rosterId;
				rv->pairingId = roster->pairId;
				//rv->dutySequenceNumber = (*duty)->getDutySegNum();
				//rv->segmentId = (*segment)->getDBId();
				rv->startDTUtc = roster->actStrUtc;
				rv->endDTUtc = roster->actRestStrUtc;
				rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
				//OP#1448提供message参数给gantt
				rv->operation_result.insert(pair<string, string>("iActual", Utility::GetInstancePtr()->iToa(iActual)));
				rv->operation_result.insert(pair<string, string>("strAttributes", strAttributes));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				rv->violation_msg = msg;
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
			}
			
		}
	}
	else {
		for (const auto& roster : crew->rosterList) {
			isMatchDays = false;
			if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBases, strRanks, strFleets, strTeams, "*", roster->actStrUtc, roster->actRestStrUtc))
				continue;

			//if (!Utility::GetInstancePtr()->isTimeOverlap(_dbData->scenario.startDtUTC, _dbData->scenario.endDtUTC + 24 * 3600, roster->actStrUtc, roster->actStrUtc))
			if (!(roster->actStrUtc >= _dbData->scenario.startDtUTC && roster->actStrUtc <= _dbData->scenario.endDtUTC + 24 * 3600))
				continue;
			if (!roster->pairing)
				continue;

			if (!strAssignments.empty() && strAssignments != "*" &&
				find(assignments.begin(), assignments.end(), roster->qualifier) == assignments.end())
				continue;
			string att = roster->pairing->getAttribute();
			
			const auto& offsetMinutes = TimezoneUtils::GetTimezoneOffset(roster->actStrUtc, zoneId);
			const auto& localDayStart = TimeUtils::GetStartTimeOfDay(roster->actStrUtc + offsetMinutes * 60);
			const auto& localDD = TimeUtils::GetDay(localDayStart);

			if (strDays.empty() || strDays == "*" || find(days.begin(), days.end(), localDD) != days.end()) {
				isMatchDays = true;
			}

			if (strAttributes != "*" && att.find(strAttributes) != string::npos && isMatchDays)
			{
				int iMax = stoi(strMax);
				int iActual = RuleStatistics::GetInstancePtr()->getActualPatternByDate(ruleParams, localDayStart);
				//cout << "iActual: " << iActual << endl;
				if (iActual > iMax)
				{
					string msg = "The number of pairings(" + Utility::GetInstancePtr()->iToa(iActual) + ") with attribute(" + strAttributes + ") on (" + TimeUtils::Format(localDayStart) + ") exceeds (" + strMax + ").";
					pCrew->legalMessage.push_back(msg);
					this->setLegalityMessage(roster, pCrew, singleRule, msg);
					pCrew->isLegal = false;
					bReturn = false;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
					rv->rosterId = roster->rosterId;
					rv->pairingId = roster->pairId;
					//rv->dutySequenceNumber = (*duty)->getDutySegNum();
					//rv->segmentId = (*segment)->getDBId();
					rv->startDTUtc = roster->actStrUtc;
					rv->endDTUtc = roster->actRestStrUtc;
					rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("iActual", Utility::GetInstancePtr()->iToa(iActual)));
					rv->operation_result.insert(pair<string, string>("strAttributes", strAttributes));
					rv->operation_result.insert(pair<string, string>("strMax", strMax));
					rv->violation_msg = msg;
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER) {
						return false;
					}
				}
			}
		}
	}


	return bReturn;
}
