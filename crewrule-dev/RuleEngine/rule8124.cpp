#pragma once


#include "RuleEngine.h"
#include <algorithm>
#include "UtilFunc.h"
//#include "Utility.h"
//#include <time.h>
//#include <iostream>
//#include "CrewDB.h"
//#include "RuleParams.h"
//#include "UtilDbg.h"
//#include "StringUtil.h"
#include "utils/RosterUtils.h"
#include "utils/StringUtils.h"
/*
 8124: 通用逻辑，两个任务的能否重叠检查
 2022.12.16
*/

bool LegalityChecker::checkRosterBringLimitation2(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string strBases = "*", strRanks = "*", strFleets = "*", strTeams = "*", strAttributes = "*", strLtedNums = "999", strQuals;
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);
		if (header == "BASES")
			strBases = headeValue;
		if (header == "RANKS")
			strRanks = headeValue;
		if (header == "FLEETS")
			strFleets = headeValue;
		if (header == "CREW TEAMS")
			strTeams = headeValue;
		if (header == "ATTRIBUTES")
			strAttributes = headeValue;
		if (header == "QUALIFICATIONS")
			strQuals = headeValue;
		if (header == "Max NUMS")
			strLtedNums = headeValue;
	}

	SharedPtr<CREW> crew = this->_dbData->crewList[pCrew->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;

	if (rosters.size() == 0 || strQuals =="*" || strQuals =="")
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
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, strBases, strRanks, strFleets, strTeams, "*", lCheckedStart, lCheckedEnd))
		return true;

	vector<string>  strLimitedAttributes, strLtdQuals;
	split(strAttributes, '|', strLimitedAttributes);
	split(strQuals, '|', strLtdQuals);

	time_t tempStart = rosters[0]->actEndUtc;
	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, tempStart);
	int offsetMinutes = 0;
	if (base.empty())
		base = _dbData->scenario.bases[0];
	if (!base.empty())
		offsetMinutes = this->_dbData->getAirportOffsetMinutes(base);

	int period = 0;
	period = stoi(strLtedNums);
	multimap<string, std::tuple<Activity*, std::shared_ptr<QualExtensionConfig>>> qualExtensionConfigsForQualMap;//multimap<qual,<Activity(扩展资质任务),QualExtensionConfig>>
	for (std::size_t i = 0; i < rosters.size(); i++)
	{
		auto tmpQualExtensionConfigsForQualMap = RosterUtils::GetQualExtensionConfigs(rosters[i].get(), this->_dbData->qualExtensionConfigMap);
		qualExtensionConfigsForQualMap.insert(tmpQualExtensionConfigsForQualMap.begin(), tmpQualExtensionConfigsForQualMap.end());

		if (!(rosters[i]->pairing))
			continue;

		if (strQuals != "*")
		{
			string pgAttributes = rosters[i]->pairing->getAttribute();

			bool isMatched = Utility::GetInstancePtr()->isPairingMatchAttributes(pgAttributes, strQuals);
			if (!isMatched)
				continue;
		}

		vector<Duty*> duties = rosters[i]->pairing->getDutyVec();

		for (auto& duty : duties)
		{
			auto segments = duty->getSegments();
			for (auto& segment : segments)
			{
				if (segment->getAssignment() != "FLY")
					continue;
				long long flt_id = segment->getDBId();
				time_t start = segment->getStartTimeUtcAct();
				time_t end = segment->getEndTimeUtcAct();
				bool hasQual = false;
				vector<SharedPtr<RosterFlight>> crewsOnFlt = this->_dbData->rosterFlightMgr.get(flt_id);
				int numOfQualifiedCrew = 0;
				int prevAssigned = 0;
				for (auto& crewOnFlt: crewsOnFlt)
				{
					string crewIdOnFlt = crewOnFlt->crewId;
					vector<SharedPtr<CREW_QUALIFICATION>> quals = this->_dbData->crewIdMap[crewIdOnFlt]->qualificationList;
					for (auto& qual : quals)
					{
						time_t qualStart = qual->issuedUtc;
						time_t qualEnd = qual->expiryUtc;
						if (qualEnd < 0)
							qualEnd = end + 24 * 3600;
						if (this->_application == ROSTER_OPTIMIZER || (this->_application == ROSTER_EDITOR && this->_dbData->scenario.scenarioId > 0)) {
							auto qualPeriod = RosterUtils::GetQualExtension(qual, qualExtensionConfigsForQualMap);
							qualStart = std::get<0>(qualPeriod);
							qualEnd = std::get<1>(qualPeriod);
						}
						if ((qualStart <= start) && (qualEnd >= end))
						{
							if (std::find(strLtdQuals.begin(), strLtdQuals.end(), qual->qual) != strLtdQuals.end())
							{
								numOfQualifiedCrew++;
								if (crewOnFlt->source != "CR")
									prevAssigned++;
								break;
							}
						}
					}
				}
				//检查符合资质条件的组员数量

			}
		}

		time_t startWindow = rosters[i]->actRestStrUtc;

		startWindow = Utility::GetInstancePtr()->getLocalDayStartInUTC(startWindow, offsetMinutes);
		if (startWindow < rosters[i]->actRestStrUtc)
			startWindow += 24 * 60 * 60;

		time_t endWindow = startWindow + period * (24 * 60 * 60);
		int iNextRoster = Utility::GetInstancePtr()->getNextAttributeRoster(rosters, (int)i, strAttributes);

		if (iNextRoster == FAILURE)
			continue;
		//两个Roster都是预占，并且属于RO，无需告警
		if ((this->GetApplication() == ROSTER_OPTIMIZER)
			&& (rosters[i]->source == "PA") && (rosters[iNextRoster]->source == "PA"))
			continue;
		//违规情形
		if (rosters[iNextRoster]->actStrUtc < endWindow)
		{
			bReturn = false;

			string msg = "No more than {0:strLtedNums} crew members with the qualifications ({1:strQuals}) are permitted on the pairing with attributes ({2:strAttributes}).";
			msg = StringUtils::Format(msg, strLtedNums, strQuals, strAttributes);

			pCrew->legalMessage.push_back(msg);
			this->setLegalityMessage(pCrew, pCrew, singleRule, msg);
			pCrew->isLegal = false;
			bReturn = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
			rv->startDTUtc = startWindow;
			rv->endDTUtc = endWindow;
			rv->violation_msg = msg;
			rv->type = VIOLATION_TYPE::CREW_VIOLATION;
			rv->operation_result.insert(pair<string, string>("LIMITED ATTRIBUTES", strAttributes));
			rv->operation_result.insert(pair<string, string>("LIMITED QUALS", strQuals));
			rv->operation_result.insert(pair<string, string>("LIMITED NUM", strLtedNums));
			this->addRuleViolations(rv, singleRule);
		}
	}
	return bReturn;
}
