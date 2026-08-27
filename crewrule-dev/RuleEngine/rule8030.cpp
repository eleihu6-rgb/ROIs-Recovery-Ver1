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
#include "utils/RosterUtils.h"
#include "utils/DutyUtils.h"

bool LegalityChecker::checkPilotAge(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;

	map<string, string> parameter = singleRule->params;
	map<string, string>::const_iterator iter;
	string header, headeValue;

	string strDivision, strAirport, strAgeLimitaion, strMaxNum, strAssignment = "*", strAssignmentGroup = "*";
	string strDir = "*", strActingRanks = "*", strComposition = "*", strActiveRanks = "*";
	vector<string> assignmentList, assignmentGroupList;
	vector<string> dirList, actingRankList, activeRankList;
	vector<string> airportList;

	//DIVISION,AIRPORT,AGE DEFINE,MAX NUMBER
	for (iter = parameter.begin(); iter != parameter.end(); iter++)
	{

		header = iter->first;
		headeValue = iter->second;
		if (header == "DIVISION") {
			strDivision = headeValue;
		}
		if (header == "MAX NUMBER") {
			strMaxNum = headeValue;
		}
		if (header == "AIRPORT") {
			strAirport = headeValue;
			split(headeValue, '|', airportList);
		}
		if (header == "AGE DEFINE") {
			strAgeLimitaion = headeValue;
		}
		if (header == "ASSIGNMENT") {
			strAssignment = headeValue;
			split(headeValue, '|', assignmentList);
		}
		if (header == "ASSIGNMENT GROUP") {
			strAssignmentGroup = headeValue;
			split(headeValue, '|', assignmentGroupList);
		}
		if (header == "DIR") { //国内和国际类型
			strDir = headeValue;
			split(headeValue, '|', dirList);
		}
		if (header == "ACTING RANKS") {
			strActingRanks = headeValue;
			split(headeValue, '|', actingRankList);
		}
		if (header == "COMPOSITION") {
			strComposition = headeValue;
		}
		if (header == "ACTIVE RANKS") {
			strActiveRanks = headeValue;
			split(headeValue, '|', activeRankList);
		}
	}
	int ageLimitation = 0, iMax = 0;
	//division 用于判断crew 的division是否符合
	if (strDivision == "*" || this->_dbData->crewList[pCrew->crewIndex]->division == strDivision)
	{
		try
		{
			ageLimitation = stoi(strAgeLimitaion);
			iMax = stoi(strMaxNum);
		}
		catch (string e)
		{
			cout << e << endl;
			return false;
		}
		unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewsOnFlt = this->_dbData->crewOnFlt;
		vector<SharedPtr<ROSTER>> rosters;
		if (this->GetApplication() == ROSTER_OPTIMIZER && pCrew->RosterIndex >= 0)
			rosters.push_back(this->_dbData->crewList[pCrew->crewIndex]->rosterList[pCrew->RosterIndex]);
		else
			rosters = this->_dbData->crewList[pCrew->crewIndex]->rosterList;

		for (vector<SharedPtr<ROSTER>>::iterator roster = rosters.begin(); roster != rosters.end(); roster++)
		{

			if ((*roster)->pairing)
			{
				vector<Duty *> duties = (*roster)->pairing->getDutyVec();

				for (vector<Duty *>::iterator duty = duties.begin(); duty != duties.end(); duty++)
				{
					vector<Segment*> segments = (*duty)->getSegments();
					for (vector<Segment*>::iterator segment = segments.begin(); segment != segments.end(); segment++)
					{
						//if (!(*segment)->getIsOperating())
						//	continue;

						if ((strAssignmentGroup != "*" && !_dbData->isAssignmentInGroup((*segment)->getAssignment(), assignmentGroupList))
							|| (strAssignment != "*" && find(assignmentList.begin(), assignmentList.end(), (*segment)->getAssignment()) == assignmentList.end()))
							continue;

						if (strDir != "*" && find(dirList.begin(), dirList.end(), (*segment)->getDomIntType()) == dirList.end()) {
							continue;
						}

						if (!strComposition.empty() && strComposition != "*") {
							string composition = DutyUtils::GetCompositionByDutyFor3(*duty, _dbData);
							if (strComposition != composition) {
								continue;
							}
						}

						if (RosterUtils::ExistExceptionCode((*roster).get(), (*segment), singleRule->exceptionCodes, _dbData)) {
							continue;
						}

						string strDep = (*segment)->getDepStation();
						string strArr = (*segment)->getArrStation();
						if (!(strAirport == "*" || std::find(airportList.begin(), airportList.end(), strDep) != airportList.end() || std::find(airportList.begin(), airportList.end(), strArr) != airportList.end()))
						{
							continue;
						}
						if (crewsOnFlt.find((*segment)->getDBId()) != crewsOnFlt.end())
						{
							vector<SharedPtr<CrewOnFlight>> cofs = crewsOnFlt.find((*segment)->getDBId())->second;
							time_t segStartUtc = (*segment)->getStartTimeUtcAct();
							int numberOfCrewReachLimitaion = 0;
							for (vector<SharedPtr<CrewOnFlight>>::iterator cof = cofs.begin(); cof != cofs.end(); cof++)
							{
								//if ((*cof)->assignment != "FLY" && (*cof)->assignment != "OPR") {
								//	continue;
								//}

								if ((*cof)->division != strDivision) {
									continue;
								}

								if (strActingRanks != "*" && find(actingRankList.begin(), actingRankList.end(), (*cof)->actingRank) == actingRankList.end()) {
									continue;
								}

								if (strActiveRanks != "*" && find(activeRankList.begin(), activeRankList.end(), (*cof)->activeRank) == activeRankList.end()) {
									continue;
								}

								if ((strAssignmentGroup != "*" && !_dbData->isAssignmentInGroup((*cof)->assignment, assignmentGroupList))
									|| (strAssignment != "*" && find(assignmentList.begin(), assignmentList.end(), (*cof)->assignment) == assignmentList.end()))
									continue;

								SharedPtr<CREW> pCrewSingle = (*cof)->crew;
								double age = pCrewSingle->getAgeByTime(segStartUtc);
								if (age >= ageLimitation)//记录大于等于最大年纪的人数
									numberOfCrewReachLimitaion++;
							}
							//人数大于最大限制告警
							if (numberOfCrewReachLimitaion > iMax)
							{
								isValid = false;

								string msg = "The number of crew older than " + strAgeLimitaion + " at the airport(" + strAirport;
								msg += ") must not exceed (" + strMaxNum + ").";
								SharedPtr<CREW> ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
								this->setLegalityMessage(ppCrew, pCrew, singleRule, msg);
								pCrew->isLegal = false;
								RULE_VIOLATION* rv = new RULE_VIOLATION();
								rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
								rv->rosterId = (*roster)->rosterId;
								rv->pairingId = (*roster)->pairId;
								rv->dutySequenceNumber = (*duty)->getDutySegNum();
								rv->segmentId = (*segment)->getDBId();
								rv->startDTUtc = segStartUtc;
								rv->endDTUtc = (*segment)->getEndTimeUtcAct();
								rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
								//OP#1448提供message参数给gantt
								rv->operation_result.insert(pair<string, string>("strAgeLimitaion", strAgeLimitaion));
								rv->operation_result.insert(pair<string, string>("strAirport", strAirport));
								rv->operation_result.insert(pair<string, string>("strMaxNum", strMaxNum));
								rv->violation_msg = msg;
								this->addRuleViolations(rv, singleRule);
								if (this->GetApplication() == ROSTER_OPTIMIZER)
									return isValid;
							}
						}
					}
				}
			}
			else {
				//地面任务
				if (!(strAirport == "*" || std::find(airportList.begin(), airportList.end(), (*roster)->location) != airportList.end()))
				{
					continue;
				}

				if ((strAssignmentGroup != "*" && !_dbData->isAssignmentInGroup((*roster)->duty, assignmentGroupList))
					|| (strAssignment != "*" && find(assignmentList.begin(), assignmentList.end(), (*roster)->qualifier) == assignmentList.end()))
					continue;

				auto iterCrew = _dbData->crewIdMap.find((*roster)->idcrew);
				if (iterCrew == _dbData->crewIdMap.end()) {
					continue;
				}
				int numberOfCrewReachLimitaion = 0;
				SharedPtr<CREW>& pCrewSingle = iterCrew->second;
				double age = pCrewSingle->getAgeByTime((*roster)->actStrUtc);
				if (age >= ageLimitation)//记录大于等于最大年纪的人数
					numberOfCrewReachLimitaion++;

				//人数大于最大限制告警
				if (numberOfCrewReachLimitaion > iMax)
				{
					isValid = false;

					string msg = "The number of crew older than " + strAgeLimitaion + " at the airport(" + strAirport;
					msg += ") must not exceed (" + strMaxNum + ").";
					SharedPtr<CREW> ppCrew = (this->_dbData->crewList[pCrew->crewIndex]);
					this->setLegalityMessage(ppCrew, pCrew, singleRule, msg);
					pCrew->isLegal = false;
					RULE_VIOLATION* rv = new RULE_VIOLATION();
					rv->crewId = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
					rv->rosterId = (*roster)->rosterId;
					rv->startDTUtc = (*roster)->actStrUtc;
					rv->endDTUtc = (*roster)->actRestStrUtc;
					rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
					rv->operation_result.insert(pair<string, string>("strAgeLimitaion", strAgeLimitaion));
					rv->operation_result.insert(pair<string, string>("strAirport", strAirport));
					rv->operation_result.insert(pair<string, string>("strMaxNum", strMaxNum));
					rv->violation_msg = msg;
					this->addRuleViolations(rv, singleRule);
					if (this->GetApplication() == ROSTER_OPTIMIZER)
						return isValid;
				}
			}
		}
	}

	return isValid;
}