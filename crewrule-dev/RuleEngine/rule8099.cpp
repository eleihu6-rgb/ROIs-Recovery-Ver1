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

bool LegalityChecker::chekcMinRestBeforeDutyByDP(vector<Duty*> duties, SharedPtr<CREW> crew)
{
	bool bReturn = true;
	//
	const vector<DBRule>& rules = this->_dbData->getRuleFunctions(RULES::MIN_REST_BEFORE_DUTY);
	if (rules.size() == 0 || duties.size() == 0)
		return true;
	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else if (crew!=NULL)
	{
		vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
		if (rosters.size() == 0)return true;
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	map<string, string>::const_iterator iter;
	string header, headeValue;
	//LQ 10.2b
	for (auto& rule : rules)
	{
		auto& parameter = rule.params;
		string enables="Y";
		vector<string> baseVec, rankVec, crewTeamVec, fleetVec;
		for (iter = parameter.begin(); iter != parameter.end(); ++iter)
		{
			header = iter->first;
			headeValue = iter->second;
			if (header == "BASES") {
				split(headeValue, '|', baseVec);
			}
			else if (header == "RANKS") {
				split(headeValue, '|', rankVec);
			}
			else if (header == "FLEETS") {
				split(headeValue, '|', fleetVec);
			}
			else if (header == "CREW TEAMS") {
				split(headeValue, '|', crewTeamVec);
			}
			else if (header == "ENABLED") {
				enables = headeValue;
			}
		}
		if (enables == "N")
			continue;

		vector<string> positionsVec;
		split("*", '|', positionsVec);

		if (crew != NULL)
		{
			bool bRetu = Utility::GetInstancePtr()->isCrewQualified(crew, baseVec, rankVec, fleetVec, crewTeamVec, positionsVec, lCheckedStart, lCheckedEnd);
			if (!bRetu) continue;
			vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
			for (auto& roster : rosters)
			{
				if (roster->pairing)
				{
					vector<Duty*> vecs= roster->pairing->getDutyVec();
					for (std::size_t i = 0; i < vecs.size(); ++i)
					{
						int dp = vecs[i]->getActualDP();
						int iMinRest = max(dp - 60, 11 * 60);

						vecs[i]->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, iMinRest, rule.idRule, rule.idRuleParam, rule.overridebility, rule.classType, rule.description, rule.reference); //20190615 ain, mantis#5947, 确保违规信息输出 rule_id

					}
				}
			}
		}
		else
		{
			for (std::size_t i = 0; i < duties.size(); ++i)
			{
				int dp = duties[i]->getActualDP();
				int iMinRest = max(dp - 60, 11 * 60);

				duties[i]->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, iMinRest, rule.idRule, rule.idRuleParam, rule.overridebility, rule.classType, rule.description, rule.reference); //20190615 ain, mantis#5947, 确保违规信息输出 rule_id
			}

		}

	}

	return bReturn;
}