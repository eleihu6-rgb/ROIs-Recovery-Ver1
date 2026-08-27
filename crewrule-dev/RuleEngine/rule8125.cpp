

#include "RuleEngine.h"
#include "Utility.h"

#include <time.h>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "utils/StringUtils.h"

using namespace std;


//bool cmpp1(SharedPtr<CREW_MANDAY_FD> m1, SharedPtr<CREW_MANDAY_FD> m2) {
//	return m1->crewDateUtc < m2->crewDateUtc;
//}
//bool cmpp2(SharedPtr<CREW_MANDAY_CC_AM> m1, SharedPtr<CREW_MANDAY_CC_AM> m2) {
//	return m1->crewDateUtc < m2->crewDateUtc;
//}

/*
  8125:check crew's cumulative BH/FDP hours when assign standby roster who is more likely to violate the cum rules.
  2023/1/17
  Parameters:
	BASES:crew bases, for example:*,PEK|TPE
	RANKS: crew ranks,for example:*,CAP|FO
	FLEETS: crew fleets,for example:*,P77|P33
	CREW TEAMS: crew teams, for example:*,T6P|T8P
	TYPE: for example: BH,FDP
	PERIOD:1
	UNIT:CM
	MAX LIMITS: 80:00 hours
	MIN LEFT:20 hours
	CHECK ASSIGNMENTS: must set the roster.assignment. for example: SBY

	illegal Roster when max limit - actual/planned hours before SBY < MIN LEFT
	当分配SBY之前的已分配任务的飞时/值勤期合计值为X，当月/周期内最大飞时/值勤期为Y，最小剩余飞时/值勤期为Z
	Y - X 必须大于等于Z
	原因：SBY后即使超时，派遣员也可以通过调整任务避免超时，但是如果SBY已经超时，分配SBY没有意义不能抓飞。
	也就是如果上述违规，限制分配SBY或分配SBY之前的飞行任务。也就是这个MIN LEFT是潜在抓飞任务环的最大飞时。
*/

bool LegalityChecker::checkMaxCummulativeExtensiton(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	DBG_HELP("LegalityChecker::checkMaxCummulativeExtenstion");

	bool isValid = true;
	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	if (rosters.size() == 0)
		return true;

	auto& parameter = singleRule->params;
	map<string, string>::const_iterator iter;

	string header, headeValue;
	string strBase="*", strRank = "*", strFleet = "*", strTeams = "*", strPeriod, strPrdDesc, strMax, strType,strAssignments = "*", strMinLeft="0:0";
	string weekdayStartFrom = this->getCrewContext()->getWeekdayStartFrom();
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "BASES")
			strBase = headeValue;
		if (header == "RANKS") 
			strRank = headeValue;
		if (header == "FLEETS")
			strFleet = headeValue;
		if (header == "CREW TEAMS")
			strTeams = headeValue;
		if (header == "PERIOD")
			strPeriod = headeValue;
		if (header == "UNIT")
			strPrdDesc = headeValue;
		if (header == "TYPE")
			strType = headeValue;
		if (header == "MAX LIMITS")
			strMax = headeValue;
		if (header == "MIN RESERVE")
			strMinLeft = headeValue;
		if (header == "CHECK ASSIGNMENTS")
			strAssignments = headeValue;
	}
	//must set assignment parameters
	if (strAssignments == "*")
		return true;

	vector<string>  strCheckAssignments;
	split(strAssignments, '|', strCheckAssignments);

	int iMax = 0,iMinLeft=0;
	string::size_type position = strMax.find(":");
	if (position != strMax.npos) 
	{
		try
		{
			iMax = stoi(strMax.substr(0, position)) * 60 + stoi(strMax.substr(position + 1));
		}
		catch (...)
		{
			iMax = 99999;
		}
	}
	else 
	{
		try
		{
			iMax = stoi(strMax);
			iMax = iMax * 60;
		}
		catch(...)
		{
			iMax = 999999;
		}
	}

	position = strMinLeft.find(":");
	if (position != strMinLeft.npos)
	{
		try
		{
			iMinLeft = stoi(strMinLeft.substr(0, position)) * 60 + stoi(strMinLeft.substr(position + 1));
		}
		catch (...)
		{
			iMinLeft = 0;
		}
	}
	else
	{
		try
		{
			iMinLeft = stoi(strMinLeft);
			iMinLeft = iMinLeft * 60;
		}
		catch(...)
		{
			iMinLeft = 0;
		}
	}

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

	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBase, strRank, strFleet, strTeams, "*", lCheckedStart, lCheckedEnd))
		return true;

	map<time_t, time_t>::iterator iter_date;

	char startUtcStr[30] = { 0 };
	char endUtcStr[30] = { 0 };


	vector<SharedPtr<CREW_MANDAY_FD>>& cfd = crew->mandayFdList;
	vector<SharedPtr<CREW_MANDAY_CC_AM>>& cabin = crew->mandayCcAmList;
	vector<SharedPtr<CREW_BASE>>&  bases = crew->baseList;

	vector<SharedPtr<CREW_RANK>>& ranks = crew->rankList;
	if (ranks.size() < 1 && strRank != "*")
		return true;
	bool isFd = (crew->division == "P");

	string base = crew->getPrimeBase();
	if (base == "")
	{
		if (this->_dbData->scenario.airline == "BR")
			base = "TPE";
		else
			base = "PEK";
	}

	auto iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	
	//if (isFd)
	//	stable_sort(cfd.begin(), cfd.end(), cmpp1);
	//else
	//	stable_sort(cabin.begin(), cabin.end(), cmpp2);

	time_t trackEnd = Utility::GetInstancePtr()->getTrackingWindowEnd(iOffsetMinutes);
	for (auto& roster : rosters)
	{
		string assignment = roster->duty;
		if (std::find(strCheckAssignments.begin(), strCheckAssignments.end(), assignment) == strCheckAssignments.end())
			continue;

		lCheckedEnd = roster->getStartTimeUtcAct();
		//根据SBY检查规则，不管SBY之后是否违规，无需检查
		if (pCrew->RosterIndex >= 0)
		{
			if (rosters[pCrew->RosterIndex]->getStartTimeUtcAct() > lCheckedEnd)
				return true;
		}

		map<time_t, time_t>& mpRange = Utility::GetInstancePtr()->getDateRangeFromLong(strPrdDesc, strPeriod, lCheckedStart, lCheckedEnd, weekdayStartFrom, iOffsetMinutes);

		//if (crew->idCrew == "0000011689")
		//	printf("");
		for (iter_date = mpRange.begin(); iter_date != mpRange.end(); ++iter_date)
		{
			if (!Utility::GetInstancePtr()->isCrewTeamQualified(crew, strTeams, (*iter_date).first, (*iter_date).second))
				continue;

			if (this->_application == ROSTER_OPTIMIZER && pCrew->RosterIndex >= 0)
			{
				if (!(Utility::GetInstancePtr()->isTimeOverlap(iter_date->first, iter_date->second, rosters[pCrew->RosterIndex]->actStrUtc, rosters[pCrew->RosterIndex]->actRestStrUtc))) {
					continue;
				}
			}

			if (!(Utility::GetInstancePtr()->isTimeOverlap(iter_date->first, iter_date->second, lCheckedStart, lCheckedEnd)))
				continue;
			double iCumFDP = 0, iCumBlh = 0;
			//在strCheckAssignments之前，并在Window内的BLH和FDP
			double iCumFDPBefore = 0, iCumBLHBefore = 0;
			if (isFd)
			{
				for (size_t j = 0; j < cfd.size(); j++)
				{
					if (cfd[j]->crewDateUtc >= iter_date->first && cfd[j]->crewDateUtc <= iter_date->second)
					{
						iCumFDP += cfd[j]->fdp;
						iCumBlh += cfd[j]->blh;
						if (cfd[j]->crewDateUtc <= lCheckedEnd)
						{
							iCumFDPBefore += cfd[j]->fdp;
							iCumBLHBefore += cfd[j]->blh;
						}
					}
				}
			}
			else
			{
				for (size_t j = 0; j < cabin.size(); j++)
				{
					if (cabin[j]->crewDateUtc >= iter_date->first && cabin[j]->crewDateUtc <= iter_date->second)
					{
						iCumFDP += cabin[j]->fdp;
						iCumBlh += cabin[j]->blh;
						if (cabin[j]->crewDateUtc <= lCheckedEnd)
						{
							iCumFDPBefore += cabin[j]->fdp;
							iCumBLHBefore += cabin[j]->blh;
						}
					}
				}
			}
			utcToLocalDtStr(iter_date->first, startUtcStr, sizeof(startUtcStr));
			utcToLocalDtStr(iter_date->second, endUtcStr, sizeof(endUtcStr));
			time_t startTime = iter_date->first;
			time_t endTime = iter_date->second;

			if ((strType == "BH") && (iMax - (int)iCumBLHBefore < iMinLeft))
			{
				string temp = Utility::GetInstancePtr()->formatMinutes(iMax - (int)iCumBLHBefore);
				string temp1 = Utility::GetInstancePtr()->formatMinutes(iMinLeft);

				string message = "UTC: From {0:startUtcStr} to {1:endUtcStr}, the reserved block hours ({2:temp}) before {3:strAssignments} is less than the minimum required for [{4:strPeriod}, {5:strPrdDesc}] of {6:temp1}.";
				message = StringUtils::Format(message, startUtcStr, endUtcStr, temp, strAssignments, strPeriod, strPrdDesc, temp1);
				this->setLegalityMessage(crew, pCrew, singleRule, message);

				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crew->idCrew;
				rv->startDTUtc = startTime;
				rv->endDTUtc = endTime;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				rv->operation_result.insert(pair<string, string>("strType", strType));
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("temp", temp));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				rv->operation_result.insert(pair<string, string>("unit", "[" + strPeriod + "," + strPrdDesc + "]"));
				this->addRuleViolations(rv, singleRule);
				pCrew->isLegal = false;
				pCrew->skipCheckInLaterIterations = true;
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
			}

			if ((strType == "FDP") && (iMax - (int)iCumFDPBefore < iMinLeft))
			{
				string temp = Utility::GetInstancePtr()->formatMinutes(iMax - (int)iCumFDPBefore);
				string temp1 = Utility::GetInstancePtr()->formatMinutes(iMinLeft);

				string message = "UTC: From {0:startUtcStr} to {1:endUtcStr}, the reserved flight duty period ({2:temp}) before {3:strAssignments} is less than the minimum required for [{4:strPeriod}, {5:strPrdDesc}] of {6:temp1}.";
				message = StringUtils::Format(message, startUtcStr, endUtcStr, temp, strAssignments, strPeriod, strPrdDesc, temp1);

				isValid = false;
				string ruleid = Utility::GetInstancePtr()->llToa(singleRule->idRule);
				this->setLegalityMessage(crew, pCrew, singleRule, message);
				pCrew->isLegal = false;
				pCrew->skipCheckInLaterIterations = true;

				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crew->idCrew;
				rv->startDTUtc = startTime;
				rv->endDTUtc = endTime;
				rv->violation_msg = message;
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				rv->operation_result.insert(pair<string, string>("strType", strType));
				rv->operation_result.insert(pair<string, string>("startUtcStr", startUtcStr));
				rv->operation_result.insert(pair<string, string>("endUtcStr", endUtcStr));
				rv->operation_result.insert(pair<string, string>("temp", temp));
				rv->operation_result.insert(pair<string, string>("strMax", strMax));
				rv->operation_result.insert(pair<string, string>("unit", "[" + strPeriod + "," + strPrdDesc + "]"));
				this->addRuleViolations(rv, singleRule);
				if (this->GetApplication() == ROSTER_OPTIMIZER) {
					return false;
				}
			}
		}
	}

	return isValid;
}
