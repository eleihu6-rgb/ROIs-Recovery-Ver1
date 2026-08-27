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
#include "rule7000/AcclimatizationOfEASARule.h"
#include "spdlog/spdlog.h"
#include "RuleFactory.h"
#include "TimezoneUtils.h"

/*
   Pier Solution Limited. 2022/6/12
   EASA 法规 7000
   ORO.FTL.105 Definitions   "Acclimatised"
*/

void LegalityChecker::setAcclimationStateOfEASA(Pairing* pairing) {
	if (this->isCheckPairingInRoster(AcclimatizationOfEASARule::RuleFuncId, pairing->getDbId())) {
		//spdlog::info("[setAcclimationStateOfEASA] pairing id={}, roster is checked", pairing->getDbId());
		return;
	}
	//spdlog::info("[setAcclimationStateOfEASA] pairing id={}", pairing->getDbId());
	AcclimatizationOfEASARule* rule = _ruleFactory->GetCalcRule<AcclimatizationOfEASARule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(pairing);
}

//PO在构建Duty阶段调用
void LegalityChecker::setAcclimationStateOfEASA(Duty* duty) {
	AcclimatizationOfEASARule* rule = _ruleFactory->GetCalcRule<AcclimatizationOfEASARule>();
	if (rule == nullptr) {
		return;
	}
	rule->CalculateDuty(duty);
}

void LegalityChecker::setAcclimationStateOfEASA(RULE_LEGALITY* pCrew) {
	AcclimatizationOfEASARule* rule = _ruleFactory->GetCalcRule<AcclimatizationOfEASARule>();
	if (rule == nullptr) {
		return;
	}
	//pCrew->RosterIndex
	std::vector<const ROSTER*> rosters;
	for (SharedPtr<ROSTER> roster : _dbData->crewList[pCrew->crewIndex]->rosterList) {
		//spdlog::info("[setAcclimationStateOfEASA] pCrew roster id={}", roster->rosterId);
		rosters.emplace_back(roster.get());
	}
	this->addCheckPairingInRoster(AcclimatizationOfEASARule::RuleFuncId, _dbData->crewList[pCrew->crewIndex]->rosterList);
	rule->CalculateDuty(rosters);
}

void LegalityChecker::setAcclimationStateOfEASA(const vector<SharedPtr<ROSTER>>& rosters) {
	AcclimatizationOfEASARule* rule = _ruleFactory->GetCalcRule<AcclimatizationOfEASARule>();
	if (rule == nullptr) {
		return;
	}
	rule->setDataContext(this->_dbData);
	rule->setApplication(this->_application);
	//pCrew->RosterIndex
	std::vector<const ROSTER*> tmpRosters;
	for (SharedPtr<ROSTER> roster : rosters) {
		//spdlog::info("[setAcclimationStateOfEASA] rosters roster id={}", roster->rosterId);
		tmpRosters.emplace_back(roster.get());
	}
	this->addCheckPairingInRoster(AcclimatizationOfEASARule::RuleFuncId, rosters);
	rule->CalculateDuty(tmpRosters);
}

//---- old ----
struct AcclimatisedStates
{
	double tzDiffFrom;
	double tzDiffTo;
	int etrtz_from;
	int etrtz_to;
	string state;
};

void LegalityChecker::setAcclimationState(vector<Duty *> duties)
{

	auto& rules = this->_dbData->getRuleFunctions(RULES::EASA_ACCLIMATISATION_DEFINITION);
	if (rules.size() == 0)
		return;

	vector<AcclimatisedStates *> statesDef;
	for (auto singleRule : rules)
	{
		auto& parameter = singleRule.params;

		map<string, string>::const_iterator iter;

		string header, headeValue;

		string tzDiffFrom = "0", tzDiffTo = "24", etrtz_lower = "00:00", etrtz_upper = "9999:59", state = "D";
		string strDefinition, strValue;
		//Ref Tz Start,Ref Tz End,ETRTZ Start,ETRTZ End,Acc State
		for (iter = parameter.begin(); iter != parameter.end(); iter++)
		{
			header = iter->first;
			headeValue = iter->second;

			//transform(header.begin(), header.end(), header.begin(), ::toupper);
			//transform(headeValue.begin(), headeValue.end(), headeValue.begin(), ::toupper);
			if (header == "REF TZ START") {
				tzDiffFrom = headeValue;
			}
			if (header == "REF TZ END") {
				tzDiffTo = headeValue;
			}
			if (header == "ETRTZ START") {
				etrtz_lower = headeValue;
			}
			if (header == "ETRTZ END") {
				etrtz_upper = headeValue;
			}
			if (header == "ACC STATE") {
				state = headeValue;
			}

		}
		//ETRTZ, TimeZone diff是分钟
		int iETRTZ_From = stoi(etrtz_lower.substr(0, etrtz_lower.find(":"))) * 60 + stoi(etrtz_lower.substr(etrtz_lower.find(":") + 1));
		int iETRTZ_To = stoi(etrtz_upper.substr(0, etrtz_upper.find(":"))) * 60 + stoi(etrtz_upper.substr(etrtz_upper.find(":") + 1));

		double fTZDiff_From = atof(tzDiffFrom.c_str());
		double fTZDiff_To = atof(tzDiffTo.c_str());

		AcclimatisedStates * accState =new AcclimatisedStates();
		accState->tzDiffFrom = fTZDiff_From;
		accState->tzDiffTo = fTZDiff_To;
		accState->etrtz_from = iETRTZ_From;
		accState->etrtz_to = iETRTZ_To;
		accState->state = state;

		statesDef.push_back(accState);

	}

	int lastAcclimatisedDutyIndex = 0;
	for (int i = 0; i < (int)duties.size(); i++)
	{
		/*
		long long pgId = duties[i]->getPairingId();
		if ((pgId == 12231106) || (pgId  == 12231108) ||  (pgId == 12231104) || (pgId == 12231111))
		{
			printf("debug");
		}
		*/
		if (i == 0)
		{
			duties[0]->setETRTZ(-1);
			duties[0]->setAcclimatisedState("D");
			string dep=duties[0]->getDepartureStation();
			duties[0]->setRefTimeZone(this->_dbData->getAirportOffsetMinutes(dep));
			duties[0]->setLastAcclimatisedDutyIndex(0);
			lastAcclimatisedDutyIndex = 0;
		}
		else
		{
			int etrtz = -1; 
			string dep = duties[i]->getDepartureStation();
			int offsetMinutes = this->_dbData->getAirportOffsetMinutes(dep);
			int timezoneDiff = TimezoneUtils::abs(duties[lastAcclimatisedDutyIndex]->getRefTimeZone() - offsetMinutes);
			time_t lastAccRepTm = duties[lastAcclimatisedDutyIndex]->getFirstBreif()->getStartUtc();
			etrtz = static_cast<int>(duties[i]->getFirstBreif()->getStartUtc() - lastAccRepTm) /60;

			string state = "D";
			for (auto& def : statesDef)
			{
				if (timezoneDiff >= def->tzDiffFrom && 
					timezoneDiff <= def->tzDiffTo && 
					etrtz >= def->etrtz_from && 
					etrtz <= def->etrtz_to)
				{
					state = def->state;
					break;
				}
			}
			duties[i]->setETRTZ(etrtz);
			duties[i]->setAcclimatisedState(state);
			if (state == "D")
			{
				duties[i]->setRefTimeZone(offsetMinutes);
				lastAcclimatisedDutyIndex = i;
				duties[i]->setLastAcclimatisedDutyIndex(i);
			}
			else
			{
				duties[i]->setRefTimeZone(duties[lastAcclimatisedDutyIndex]->getRefTimeZone());
				duties[i]->setLastAcclimatisedDutyIndex(lastAcclimatisedDutyIndex);
				duties[i]->setTzDiffs(timezoneDiff);
			}
		}
	}

	/*
	if (duties.size() > 0)
	{
		long long pgId = duties[0]->getPairingId();
		if ((pgId == 12231106) || (pgId == 12231108) || (pgId == 12231104) || (pgId == 12231111))
		{
			for (auto duty : duties)
			{
				int etrtz=duty->getETRTZ();
				int tz=duty->getRefTimeZone();
				string state=duty->getAcclimatisedState();
				int lastAcc = duty->getLastAcclimatisedDutyIndex();
				printf(state.c_str());
			}

		}
	}
	*/
}