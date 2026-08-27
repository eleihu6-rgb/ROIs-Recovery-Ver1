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

using namespace std;
bool times_cmp(WORKDUTY_TIMES * m1, WORKDUTY_TIMES * m2)  {
	return m1->startUtcTime < m2->startUtcTime;
}

bool LegalityChecker::checkGapBtwTwoDiscretions(RULE_LEGALITY * pPairing, const DBRule* singleRule)
{
	bool isValid = true;
	auto& parameter = singleRule->params;

	map<string, string>::const_iterator iter;

	string header, headeValue;
	string pGaps, pPrevDiscretion,pNextDiscretion, pBase, pRank, pFleet;
	
	for (iter = parameter.begin(); iter != parameter.end(); ++iter)
	{
		header = iter->first;
		headeValue = iter->second;
		transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);

		if (header == "BASES")			pBase = headeValue;
		if (header == "RANKS")			pRank = headeValue;
		if (header == "FLEETS")			pFleet = headeValue;
		if (header == "MIN REST IN BETWEEN")	 pGaps = headeValue;
		if (header == "PREVIOUS FDP EXTENSION")  pPrevDiscretion = headeValue;
		if (header == "NEXT FDP EXTENSION")		 pNextDiscretion = headeValue;
	}

	SharedPtr<CREW> crew = this->_dbData->crewList[pPairing->crewIndex];
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	if (rosters.size() < 2)
		return true;

	time_t lCheckedStart = 0, lCheckedEnd = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		lCheckedStart = this->_dbData->scenario.startDtUTC;
		lCheckedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		lCheckedStart = rosters[0]->actStrUtc;
		lCheckedEnd = rosters[rosters.size() - 1]->restStrUtc;
	}
	if (!Utility::GetInstancePtr()->isCrewQualified(crew, pBase, pRank, pFleet, "*", "*", lCheckedStart, lCheckedEnd))
		return true;

	int iPrevDiscretion = hhmmStrToMinutes(pPrevDiscretion);
	int iNextDiscretion = hhmmStrToMinutes(pNextDiscretion);
	int iGap = hhmmStrToMinutes(pGaps);
	//if (crew->idCrew == "A01412")
	//	printf("");
	vector<WORKDUTY_TIMES *> discretions,works;
	for (std::size_t i = 0; i < rosters.size(); ++i)
	{
		if (!(rosters[i]->pairing))
			continue;
		vector<Duty *> duties = rosters[i]->pairing->getDutyVec();
		for (std::size_t k = 0; k < duties.size(); k++)
		{
			if (duties[k]->getFdpDiscretion() >= min(iPrevDiscretion, iNextDiscretion))
			{
				WORKDUTY_TIMES* discretion = new WORKDUTY_TIMES();
				discretion->startUtcTime = duties[k]->getStartTimeUtcAct();
				discretion->endUtcTime = duties[k]->getEndTimeUtcAct();
				discretion->rosterIndex = (int)i;
				discretion->savedValue = duties[k]->getFdpDiscretion();
				discretions.push_back(discretion);
			}
		}
	}
	stable_sort(discretions.begin(), discretions.end(), times_cmp);

	bool isCountLayover = true;
	for (std::size_t r = 0; r < rosters.size(); r++)
	{
		if (RuleParams::GetInstancePtr()->isRestAssignment(rosters[r]->qualifier, rosters[r]->duty))
			continue;
		Pairing * pg = rosters[r]->pairing;

		if (!pg || !isCountLayover)
		{
			WORKDUTY_TIMES* work = new WORKDUTY_TIMES();
			work->startUtcTime = rosters[r]->actStrUtc;
			work->endUtcTime = rosters[r]->actRestStrUtc;
			work->needRuleCheck = rosters[r]->needRuleCheck;
			work->dutyType = rosters[r]->duty;
			work->rosterIndex = (int)r;
			works.push_back(work);
			continue;
		}

		vector<Duty *> duties = pg->getDutyVec();
		if (isCountLayover)
		{
			for (size_t i = 0; i < duties.size(); i++)
			{
				Duty::DUTY_TYPE dt = duties[i]->getType();
				time_t start = duties[i]->getStartTimeUtcAct() - duties[i]->getActualPickupMin() * 60;
				time_t end = duties[i]->getEndTimeUtcAct() + duties[i]->getActualDropoffMin() * 60;
				if ((dt != Duty::DUTY_PAIRING_REST) && (dt != Duty::DUTY_BLANK_DAY))
				{
					WORKDUTY_TIMES* work = new WORKDUTY_TIMES();
					work->startUtcTime = start;
					work->endUtcTime = end;
					work->needRuleCheck = rosters[r]->needRuleCheck;
					work->dutyType = rosters[r]->duty;
					work->rosterIndex = (int)r;
					works.push_back(work);
				}
			}
		}
	}
	stable_sort(works.begin(), works.end(), times_cmp);

	for (int j = 0; j + 1 < (int)discretions.size(); ++j)
	{
		if (!(discretions[j]->savedValue >= iPrevDiscretion && discretions[j + 1]->savedValue >= iNextDiscretion))
			continue;

		time_t end = discretions[j]->endUtcTime;
		time_t start = discretions[j + 1]->startUtcTime;
		bool needRuleCheckInRange = false;
		int iMaxRest = getMaxRestInRange(works, end, start, needRuleCheckInRange);

		int actualGap = static_cast<int>(start - end)/60;
		if ((actualGap  < iGap) || (iMaxRest < iGap))
		{
			string msg = "The rest period ({0:iMaxRest}) between two duties with discretion is less than the minimum required ({1:pGaps}).";
			msg = StringUtils::Format(msg, Utility::GetInstancePtr()->formatMinutes(iMaxRest), pGaps);
			pPairing->legalMessage.push_back(msg);
			this->setLegalityMessage(rosters[discretions[j]->rosterIndex], pPairing, singleRule, msg);
			pPairing->isLegal = false;
			isValid = false;
			RULE_VIOLATION* rv = new RULE_VIOLATION();
			rv->crewId =crew->idCrew;
			rv->rosterId = rosters[discretions[j]->rosterIndex]->rosterId;
			//rv->pairingId = roster->pairId;
			//rv->dutySequenceNumber = (*duty)->getDutySegNum();
			//rv->segmentId = (*segment)->getDBId();
			rv->startDTUtc = end;
			rv->endDTUtc = start;
			rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
			//OP#1448提供message参数给gantt
			rv->operation_result.insert(pair<string, string>("iMaxRest", Utility::GetInstancePtr()->formatMinutes(iMaxRest)));
			rv->operation_result.insert(pair<string, string>("pGaps", pGaps));
			rv->violation_msg = msg;
			this->addRuleViolations(rv, singleRule);
			if (this->GetApplication() == ROSTER_OPTIMIZER){
				//20190418 ain, mantis#5183, clear mem
				ClearVector(WORKDUTY_TIMES, works);
				ClearVector(WORKDUTY_TIMES, discretions);
				return false;
			}
		}
	}
	//20190418 ain, mantis#5183, clear mem
	ClearVector(WORKDUTY_TIMES, works);
	ClearVector(WORKDUTY_TIMES, discretions);
	return isValid;
}

