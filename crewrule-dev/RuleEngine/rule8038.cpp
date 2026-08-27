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


bool LegalityChecker::checkRosterSpace(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool bReturn = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string strDefinition, strValue;
	//ASSIGNMENT A,ASSIGNMENT B,DIRECTIONAL,GAP,UNIT,UTILIZE POST DUTY REST
	string assignmentA, assignmentB, sGap, sUnit;
	bool bOneDirection, bUtilizePostRest;
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "ASSIGNMENT A") {
			assignmentA = headeValue;
		}
		if (header == "ASSIGNMENT B") {
			assignmentB = headeValue;
		}
		if (header == "GAP") {
			sGap = headeValue;
		}
		if (header == "UNIT") {
			sUnit = headeValue;
		}
		if (header == "DIRECTIONAL") {
			bOneDirection = (headeValue == "Y");
		}
		if (header == "UTILIZE POST DUTY REST") {
			bUtilizePostRest = (headeValue == "Y");
		}
	}
	string crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
	vector<SharedPtr<ROSTER>>& rosters = this->_dbData->crewList[pCrew->crewIndex]->rosterList;
	time_t startTime, endTime;
	int iGap = stoi(sGap);
	string assignment, base, assignment_b;
	time_t dayStartTime;
	int iDays, iHours, iMinutes;
	for (std::size_t i = 0; i < rosters.size(); ++i)
	{
		assignment = rosters[i]->duty;
		base = rosters[i]->location;
		if (base.size() == 0)
		{
			if (rosters[i]->pairing)
				base = rosters[i]->pairing->getBase();
		}
		auto iOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
		if ((bOneDirection && assignment == assignmentA) || (!bOneDirection && (assignment == assignmentA || assignment == assignmentB)))
		{
			for (std::size_t j = i + 1; j < rosters.size(); j++)
			{
				bReturn = true;
				assignment_b = rosters[j]->duty;
				if ((bOneDirection && assignment_b == assignmentB)
					|| (!bOneDirection && ((assignment == assignmentA && assignment_b == assignmentB) || (assignment == assignmentB && assignment_b == assignmentA))))
				{
					if (bUtilizePostRest)
						startTime = rosters[i]->actRestStrUtc;
					else
						startTime = rosters[i]->actEndUtc;
					endTime = rosters[j]->actStrUtc;

					if (sUnit == "CD")
					{
						dayStartTime = Utility::GetInstancePtr()->getLocalDayStartInUTC(startTime, iOffsetMinutes);
						if (dayStartTime < startTime)
							dayStartTime = dayStartTime + 24 * 3600;
						iDays = (int)(difftime(endTime, startTime) / (24 * 3600));
						if (iDays < iGap)
							bReturn = false;

					}
					else if (sUnit == "RH")
					{
						iHours = (int)(difftime(endTime, startTime) / 3600);
						if (iHours < iGap)
							bReturn = false;
					}
					else if (sUnit == "RM")
					{
						iMinutes = (int)(difftime(endTime, startTime) / 60);
						if (iMinutes < iGap)
							bReturn = false;
					}
					else
					{
						bReturn = true;
						return bReturn;
					}

					if (!bReturn)
					{
						if (!(rosters[i]->needRuleCheck) && !(rosters[j]->needRuleCheck) && (this->_application == ROSTER_OPTIMIZER))
							continue;

						stringstream stream;
						string result1, result2;
						stream << rosters[i]->rosterId;
						stream >> result1;

						//print and set violations here
						string msg = "The spacing between two rostes[" + result1 + ",";
						stream.clear();
						stream << rosters[j]->rosterId;
						stream >> result2;

						msg += result2 + "] must be at least " + sGap + " " + sUnit;
						setLegalityMessage(rosters[i], pCrew, singleRule, msg);
						pCrew->isLegal = false;
						bReturn = false;
						RULE_VIOLATION* rv = new RULE_VIOLATION();
						rv->crewId = crewId;
						rv->rosterId = rosters[i]->rosterId;
						//rv->pairingId = (*it_roster)->pairId;
						//rv->dutySequenceNumber = (*it_duty)->getDutySegNum();
						//rv->segmentId = (*it_seg)->getDBId();
						rv->startDTUtc = startTime;
						rv->endDTUtc = endTime;
						rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
						//OP#1448提供message参数给gantt
						rv->operation_result.insert(pair<string, string>("result1", result1));
						rv->operation_result.insert(pair<string, string>("result2", result2));
						rv->operation_result.insert(pair<string, string>("sGap", sGap));
						rv->violation_msg = msg;
						this->addRuleViolations(rv, singleRule);
						if (this->GetApplication() == ROSTER_OPTIMIZER){
							return false;
						}
					}
				}
			}

		}
	}


	return bReturn;
}