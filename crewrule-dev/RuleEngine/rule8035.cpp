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





//ADDITIONAL_REST = 8035
bool LegalityChecker::checkAdditionalRest(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;

	//CREW BASE,DUTY ASSIGNMENT GROUP,ENLARGE HOURS
	//TPE(*),GND,02:00
	auto& parameter = singleRule->params;
	map<string, string>::const_iterator iter;
	string header, headeValue;
	string rBase, rDutyAssGroup, rEnlargeHours;
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "CREW BASE")
			rBase = headeValue;
		if (header == "DUTY ASSIGNMENT GROUP")
			rDutyAssGroup = headeValue;
		if (header == "ENLARGE HOURS")
			rEnlargeHours = headeValue;
	}

	int iRequiredMinutes = Utility::GetInstancePtr()->convertToMinutes(rEnlargeHours); //stoi(rEnlargeHours.substr(0, 2)) * 60 + stoi(rEnlargeHours.substr(3, 2));
	vector<SharedPtr<ROSTER>>& rosters = this->_dbData->crewList[pCrew->crewIndex]->rosterList;

	vector<SharedPtr<CREW_BASE>>& bases = this->_dbData->crewList[pCrew->crewIndex]->baseList;

	time_t lScenarioStart = this->_dbData->scenario.startDtUTC;
	time_t lScenarioEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	bool bIsBase = false;
	string sBase = rBase;

	if (rBase != "*")
	{
		for (vector<SharedPtr<CREW_BASE>>::iterator base = bases.begin(); base != bases.end(); base++)
		{
			if ((*base)->base == rBase)
			{
				if ((*base)->effUtc <= lScenarioStart && ((*base)->expUtc <= 0 || (*base)->expUtc >= lScenarioEnd))
				{
					bIsBase = true;
				}
			}
		}
		if (!bIsBase)
			return true;
	}

	vector<SharedPtr<DBRule_8014>>& assignments = this->_dbData->rule_8014;
	vector<string> dutyGroup;
	string airline = this->_dbData->scenario.airline;
	for (vector<SharedPtr<DBRule_8014>>::iterator assign = assignments.begin(); assign != assignments.end(); assign++)
	{
		if ((*assign)->assignmentGroup == rDutyAssGroup && (this->_dbData->version == 3 || (*assign)->airline == airline))
			dutyGroup.push_back((*assign)->assignemnt);
	}
	string assignment;
	//20160719 mod by ain
	//避免 rosters.size()-1因数据类型size_t导致roster=0 且 rosters为空时 roster < rosters.size()-1为true
	for (int roster = 0; (!rosters.empty() && roster < (int)rosters.size() - 1); roster++)
	{
		if (rosters[roster]->getBase() == rBase || rBase == "*")
		{
			assignment = rosters[roster]->duty;
			if (std::find(dutyGroup.begin(), dutyGroup.end(), assignment) != dutyGroup.end())
			{
				int t = 0;
				//find next working roster
				for (t = roster + 1; t + 1 < (int)rosters.size(); ++t)
				{
					if (!(RuleParams::GetInstancePtr()->isRestAssignment(rosters[t]->qualifier, rosters[t]->duty)))
						break;
				}
				if (rosters[t]->actStrUtc - rosters[roster]->actEndUtc < iRequiredMinutes * 60)
				{
					if (this->_application == ROSTER_OPTIMIZER && !(rosters[t]->needRuleCheck) && !(rosters[roster]->needRuleCheck))
						continue;
					bReturn = false;
					string msg = "Crew at base(" + rBase + ") assigned to duty assignment(" + rDutyAssGroup + ") must have additional rest of(" + rEnlargeHours + ").";
					this->setLegalityMessage(rosters[roster], pCrew, singleRule, msg);
					pCrew->isLegal = false;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = rosters[roster]->idcrew;
					rv->rosterId = rosters[roster]->rosterId;
					//rv->pairingId = (*roster)->pairId;
					//rv->dutySequenceNumber = (*duty)->getDutySegNum();
					//rv->segmentId = (*segment)->getDBId();
					rv->startDTUtc = rosters[roster]->actStrUtc;
					rv->endDTUtc = rosters[t]->actStrUtc;
					rv->violation_msg = msg;
					rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
					//OP#1448提供message参数给gantt
					rv->operation_result.insert(pair<string, string>("rBase", rBase));
					rv->operation_result.insert(pair<string, string>("rDutyAssGroup", rDutyAssGroup));
					rv->operation_result.insert(pair<string, string>("rEnlargeHours", rEnlargeHours));
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER){
						return false;
					}
				}
			}
		}
	}

	return bReturn;
}