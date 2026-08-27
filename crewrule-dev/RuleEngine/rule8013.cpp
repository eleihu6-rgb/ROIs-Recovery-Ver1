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

using namespace std;

bool LegalityChecker::checkQualCombination(RULE_LEGALITY * pCrew, const DBRule* singleRule)
{
	bool isValid = true;
	vector<SharedPtr<DBRule_CrossRank>>& qual_comb = this->_dbData->crossRankRuleList;
	string crewid = this->_dbData->crewList[pCrew->crewIndex]->idCrew;
	unordered_map<long long, vector<SharedPtr<CrewOnFlight>>>& crewsOnFlt = this->getDataContext()->crewOnFlt;
	vector<SharedPtr<ROSTER>>& rosters = this->_dbData->crewList[pCrew->crewIndex]->rosterList;

	vector<SharedPtr<ROSTER>>::iterator iter_roster;

	for (iter_roster = rosters.begin(); iter_roster != rosters.end(); ++iter_roster){
		if (!(*iter_roster)->needRuleCheck && this->_application == ROSTER_OPTIMIZER){
			continue;
			//cout << "No need to check rule" << endl;
		}
		if ((*iter_roster)->duty != "FLY") continue;
		if ((*iter_roster)->pairing)
		{
			string division = (*iter_roster)->pairing->getDivision();
			int cof = (*iter_roster)->pairing->getCof();
			vector<Duty *> duties = (*iter_roster)->pairing->getDutyVec();
			for (vector<Duty*>::iterator iter_duty = duties.begin(); iter_duty != duties.end(); iter_duty++){
				Duty::DUTY_TYPE dt = (*iter_duty)->getType();
				if ((dt != Duty::DUTY_FLY) || (dt != Duty::DUTY_PURE_OPR))
					continue;
				vector<Segment*> segments = (*iter_duty)->getSegments();
				for (vector<Segment*>::iterator iter_seg = segments.begin(); iter_seg != segments.end(); ++iter_seg){
					if (!(*iter_seg)->getIsOperating())
						continue;
					string depCode = (*iter_seg)->getDepStation();
					string arrCode = (*iter_seg)->getArrStation();
					string fleet = (*iter_seg)->getFleetCD();

					for (vector<SharedPtr<DBRule_CrossRank>>::iterator it_cross = qual_comb.begin(); it_cross != qual_comb.end(); ++it_cross){
						if (((*it_cross)->cof == cof) &&
							((*it_cross)->division == division) &&
							((*it_cross)->fleet == fleet) &&
							((*it_cross)->dep_arp.size() == 0 || (*it_cross)->dep_arp == depCode) &&
							((*it_cross)->arv_arp.size() == 0 || (*it_cross)->arv_arp == arrCode)
							)
						{
							string quals = (*it_cross)->qual_list;
							long long flt_id = (*iter_seg)->getDBId();
							time_t start = (*iter_seg)->getStartTimeUtcAct();
							time_t end = (*iter_seg)->getEndTimeUtcAct();
							if (crewsOnFlt.find(flt_id) != crewsOnFlt.end())
							{
								vector<SharedPtr<CrewOnFlight>> crews = crewsOnFlt.find(flt_id)->second;
								//crews.push_back(&(this->_dbData->crewList[pCrew->crewIndex]));

								//check qualifications combinations
								//private function
								//hasQualsCombInCOF(vector<SharedPtr<CREW>>,quals list, start,end)
								bool hasQuals = hasQualCombInCof(crews, quals, start, end);
								if (hasQuals)
								{
									pCrew->isLegal = false;
									isValid = false;
									string message = "Crew" + crewid +  ":invalid qualications (" + quals + ") for flight(" + (*iter_seg)->getSegNumber() + ")";
									this->setLegalityMessage((*iter_seg), singleRule, message);
									RULE_VIOLATION* rv = new RULE_VIOLATION();
									rv->crewId = crewid;
									rv->rosterId = (*iter_roster)->rosterId;
									rv->pairingId = (*iter_roster)->pairId;
									rv->dutySequenceNumber = (*iter_duty)->getDutySegNum();
									rv->segmentId = (*iter_seg)->getDBId();
									rv->startDTUtc = (*iter_seg)->getStartTimeUtcAct();
									rv->endDTUtc = (*iter_seg)->getEndTimeUtcAct();
									rv->violation_msg = message;
									rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
									//OP#1448提供message参数给gantt
									rv->operation_result.insert(pair<string, string>("quals", quals));
									rv->operation_result.insert(pair<string, string>("SegNumber", (*iter_seg)->getSegNumber()));
									this->addRuleViolations(rv, singleRule);
									if (this->GetApplication() == ROSTER_OPTIMIZER){
										return false;
									}

								}
							}
						}
					}
				}
			}
		}
	}

	return isValid;
}