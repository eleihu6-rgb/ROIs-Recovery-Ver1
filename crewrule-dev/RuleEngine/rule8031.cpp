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


bool LegalityChecker::checkTeamRoster(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	DBG_HELP("LegalityChecker::checkTeamRoster");

	bool isValid = true;

	SharedPtr<CREW> pSingleCrew = (this->_dbData->crewList[pCrew->crewIndex]);
	vector<SharedPtr<ROSTER>>& rosters = pSingleCrew->rosterList;
	string crewId = pSingleCrew->idCrew;
	DBG_HELP5("LegalityChecker::checkTeamRoster crew=", crewId);
	vector<SharedPtr<CREW_TEAM>> teams = pSingleCrew->teamList;

	DBG_HELP3("LegalityChecker::checkTeamRoster 0");

	time_t start = this->_dbData->scenario.startDtUTC;
	time_t end = this->_dbData->scenario.endDtUTC;
	vector<SharedPtr<CREW_TEAM>> instructors;

	DBG_HELP3("LegalityChecker::checkTeamRoster1");
	if (teams.size() > 0)
	{
		unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewsOnFlt = this->_dbData->crewOnFlt;
		string role;
		long long teamId = -1;
		SharedPtr<CREW_TEAM> findCrew;
		for (vector<SharedPtr<CREW_TEAM>>::iterator team = teams.begin(); team != teams.end(); team++)
		{
			//假设instructor和student仅仅属于单一team
			if ((*team)->idcrew == crewId)
			{
				findCrew = (*team);
				break;
			}
		}
		role = findCrew->role;
		if (role == "INSTR")
			return true;

		teamId = findCrew->team_id;
		time_t eff = findCrew->effDt;
		time_t exp = findCrew->expDt;

		if (exp < 0)
			exp = end + 24 * 60 * 60;

		//BasicCalculation* cal = new BasicCalculation();

		DBG_HELP3("LegalityChecker::checkTeamRoster 2");
		for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); roster++)
		{

			DBG_HELP4("LegalityChecker::checkTeamRoster for rosters pair_id=", roster->get()->pairId);
			if (!(*roster)->pairing)
				continue;

			time_t roster_start = (*roster)->actStrUtc;
			time_t roster_end = (*roster)->actEndUtc;

			if ((eff > roster_end) || (exp < roster_start))
				continue;

			//get effective instructor list by student crew id
			for (vector<SharedPtr<CREW_TEAM>>::iterator team = teams.begin(); team != teams.end(); team++)
			{

				if ((*team)->role == "INSTR")
				{
					time_t effTemp = (*team)->effDt;
					time_t expTemp = (*team)->expDt;
					if (expTemp < 0)
						expTemp = end + 24 * 60 * 60;
					if ((effTemp > roster_end) || (expTemp < roster_start))
						continue;
					instructors.push_back((*team));
				}
			}

			vector<Segment*> segments = (*roster)->getOperatingSegments();

			for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); segment++)
			{
				long long flt_id = (*segment)->getDBId();
				if (crewsOnFlt.find(flt_id) != crewsOnFlt.end())
				{
					vector<SharedPtr<CrewOnFlight>> crews = crewsOnFlt.find(flt_id)->second;

					bool find = false;
					for (vector<SharedPtr<CREW_TEAM>>::iterator team = instructors.begin(); team != instructors.end(); team++)
					{
						string instrId = (*team)->idcrew;
						for (vector<SharedPtr<CrewOnFlight>>::iterator crew = crews.begin(); crew != crews.end(); crew++)
						{
							if ((*crew)->crewId == instrId)
								find = true;
						}
					}

					if (!find)
					{
						isValid = false;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = crewId;
						if ((*roster)->pairing)
						{
							rv->rosterId = (*roster)->rosterId;
							rv->pairingId = (*roster)->pairId;
						}

						string msg = "The strudent crew(" + crewId + ") must fly together with one of the instructors in the same crew team on roster(";
						msg += Utility::GetInstancePtr()->ToString((*roster)->rosterId) + ").";
						//SharedPtr<CREW> ppCrew = &(this->_dbData->crewList[pCrew->crewIndex]);
						this->setLegalityMessage((*roster), pCrew, singleRule, msg);
						pCrew->isLegal = false;
						rv->crewId = crewId;
						rv->rosterId = (*roster)->rosterId;
						rv->startDTUtc = roster_start;
						rv->endDTUtc = roster_end;
						rv->violation_msg = msg;
						rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("rosterId", Utility::GetInstancePtr()->ToString((*roster)->rosterId)));
						this->addRuleViolations(rv, singleRule);
						if (this->GetApplication() == ROSTER_OPTIMIZER)
							return isValid;

					}
				}
				//暂时忽略教员小时数要求的条件
				//int instMinutes = cal->getInstructorMinutes(pSingleCrew, teams, rosters, start, end);
			}

		}

		//delete cal;
		//cal = NULL;
	}
	return isValid;
}
