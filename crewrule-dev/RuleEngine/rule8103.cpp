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
#include "utils/StringUtils.h"

bool LegalityChecker::checkMaxLocalNights(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	if (pCrew->crewIndex < 0 || pCrew->crewIndex >= (int)_dbData->crewList.size())
		return true;
	SharedPtr<CREW> crew = _dbData->crewList[pCrew->crewIndex];

	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	if (rosters.size() == 0)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER || this->_application == ROSTER_EDITOR)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	Local_Night_Definition local_night = RuleParams::GetInstancePtr()->getLocalNightDefinition();
	if (local_night.LocalEnd.empty() && local_night.LocalStart.empty())
	{
		Logger::getRuleLogger()->error("Exception::No local night definition rules (rule 2014).");
		return true;
	}

	auto& parameter = singleRule->params;
	map<string, string>::const_iterator iter;
	string header, headeValue;
	string strBase, strRank, strFleet,strPeriod,strUnit,strMaxConsecutiveLocalNight="0";
	string weekdayStartFrom = this->getCrewContext()->getWeekdayStartFrom();
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "BASES") {
			strBase = headeValue;
		}
		if (header == "RANKS") {
			strRank = headeValue;
		}
		if (header == "FLEETS") {
			strFleet = headeValue;
		}		
		if (header == "PERIOD") {
			strPeriod = headeValue;
		}
		if (header == "UNIT") {
			strUnit = headeValue;
		}
		if (header == "MAX CONSECUTIVE LOCAL NIGHTS") {
			strMaxConsecutiveLocalNight = headeValue;
		}
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;
	string base = crew->getPrimeBase();
	
	if (base == "")
		base = "PNH";
	int iNumber = atoi(strPeriod.c_str());
	int iMax = atoi(strMaxConsecutiveLocalNight.c_str());
	auto iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);

	map<time_t, time_t>& mpRange = Utility::GetInstancePtr()->getDateRangeFromLong(strUnit, strPeriod, lCheckedStart, lCheckedEnd, weekdayStartFrom, iOffsetMinutes);

	vector<Rest_Ranges*> works = Utility::GetInstancePtr()->getWorkingRanges(rosters, lCheckedStart, lCheckedEnd, true, base);	

	char startUtcStr[30] = { 0 };
	char endUtcStr[30] = { 0 };
	for (auto& work : works)
	{
		int localNights = Utility::GetInstancePtr()->hasXConsecutiveLocalNightsBeforeTm(works, iNumber, work->endInUtc, local_night, iOffsetMinutes,work->startInUtc,true);
		if (localNights > iMax )
		{
			bReturn = false;
			utcToLocalDtStr(work->startInUtc, startUtcStr, sizeof(startUtcStr));
			utcToLocalDtStr(work->endInUtc + 24 * 3600 - 1, endUtcStr, sizeof(endUtcStr));
			string msg = "The consecutive local nights in the range (UTC: {0:startUtcStr}-{1:endUtcStr}) must be less than {2:strMaxConsecutiveLocalNight}.";
			msg = StringUtils::Format(msg, startUtcStr, endUtcStr, strMaxConsecutiveLocalNight);

			this->setLegalityMessage(crew, pCrew, singleRule, msg);
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->idRule = singleRule->idRule;
			if (crew)
				rv->crewId = crew->idCrew;
			//rv->rosterId = rosters[i]->rosterId;
			//rv->pairingId = rosters[i]->pairId;
			//rv->dutySequenceNumber = duty->getDutySegNum();
			//rv->segmentId = (*segment)->getDBId();
			rv->startDTUtc = work->startInUtc;
			rv->endDTUtc = work->endInUtc;
			rv->violation_msg = msg;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			rv->operation_result.insert(pair<string, string>("maxLocalConsecutiveNights", strMaxConsecutiveLocalNight));
			rv->operation_result.insert(pair<string, string>("actualLocalConsecutiveNights", Utility::GetInstancePtr()->iToa(localNights)));
			this->addRuleViolations(rv, singleRule);
		}
	}

	return bReturn;
}