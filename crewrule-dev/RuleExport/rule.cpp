//#include "rule.h"
#include "../RuleEngine/RuleEngine.h"
#include "RuleParams.h"
#include "../db/rapidjson/document.h"
#include "..\db\JsonPairing.h"
#include "..\db\JsonParser\JsonParser.h"
#include <sstream>
#include <fstream>
#include <algorithm>

LegalityChecker* ruleEngine;

__declspec(dllexport) void setDBConnection(const char* const host, const char* const user, const char* const password)
{
	if (!ruleEngine)
		ruleEngine = new LegalityChecker(0, false);
	ruleEngine->setDBConnectionString(host, user, password);
}

//pairing editor interface
__declspec(dllexport) int checkPGRulesByJson(const char* jsonFilePath,const char* jsonOutputPath)
{
	vector<Pairing*> list;
	rapidjson::Document doc;
	int ret = readFile_PairingList(jsonFilePath, list, doc);
	if (ret != 0)
		return ret;

	int iFDPMode = RuleParams::GetInstancePtr()->GetFDPMode();
	CalculationManday FDP = ruleEngine->getDataContext()->calculationMandayMap["FDP"];	
	CalculationManday ACT_FDP = ruleEngine->getDataContext()->calculationMandayMap["ACT FDP"];
	CalculationManday DP = ruleEngine->getDataContext()->calculationMandayMap["DP"];
	CalculationManday ACT_DP = ruleEngine->getDataContext()->calculationMandayMap["ACT DP"];

	for (int i = 0; i < list.size(); i++) {
		Pairing* p = list[i];
		printf("Pairing startUtc:%d\n", p->getStartTimeUtc());
		p->resetNewPairingBySegments(ruleEngine->getDataContext()->baseList);
		Value &docPairing = doc[i];
		for (int j = 0; j < p->getDutyVec().size(); j++)
		{
			Duty* d = p->getDutyVec()[j];

			d->setMinBrief(30);
			d->setMinDebrief(30);
			d->setMinPickup(15);
			d->setMinDropoff(15);

			d->calculateDutyValues();
			//d->calculateFDP(0, FDP.str, FDP.end);
			//d->calculateFDP(1, ACT_FDP.str, ACT_FDP.end);
			d->calculateDP(0,DP.str,DP.end);
			d->calculateDP(1, ACT_DP.str, ACT_DP.end);

			printf("call checkPGRulesByJson()\n");
			
		}
		vector<int> rules;
		bool bReturn = ruleEngine->checkPGRules(p, rules, PAIRING_EDITOR);
	}

	map<long long, vector<RULE_VIOLATION*>> pairingViolations;
	//write to file
	stringstream ss;
	ret = formatToJson_PairingList(ss, list, pairingViolations);
	if (ret != 0)
		return ret;
	std::ofstream outFile;
	outFile.open(jsonOutputPath);
	outFile << ss.rdbuf();
	outFile.close();

	//generateJson(doc, list,"d");
	return 0;
}

__declspec(dllexport) void setDBContext(SharedPtr<CrewDataContext> context){
	if (!ruleEngine)
		ruleEngine = new LegalityChecker(0, false);
	ruleEngine->setDataContext(context);
}

/*void initialize_db(int scenarioId, long startUtc, long endUtc)
{
	lc = new LegalityChecker(0, true);

	vector<string>  baseList, fleetList, rankList;
	baseList.push_back("PEK");
	fleetList.push_back("P78");
	fleetList.push_back("P7X");
	fleetList.push_back("T77");
	fleetList.push_back("T78");
	fleetList.push_back("K77");
	rankList.push_back("FO");

	lc->initializeDB(scenarioId, startUtc, endUtc,baseList,fleetList,rankList);
}*/

__declspec(dllexport) bool checkMaxBlock_R4(Duty * duty){
	bool isLegal = true;
	DBRule singleRule;
	for (int iRule = 0; iRule < ruleEngine->getDataContext()->ruleList.size(); iRule++) {
		//check every singel rule
		singleRule = ruleEngine->getDataContext()->ruleList[iRule];
		//将来用函数指针取代switch case
		int iPhase = singleRule.phase;

		if (iPhase != (int)PHASE::PHASE_PLANNING) continue;

		switch (singleRule.function)
		{
		case RULES::MAX_BLOCK_PERDUTY_R4:
			isLegal = ruleEngine->checkBlockPerDutyByDuty_R4(duty, &singleRule);
			break;
		default:
			printf("No rule to be checked.\n");
		}

	}

	return isLegal;
}

__declspec(dllexport) bool checkMaxFDP_R4(Duty * duty){
	bool isLegal = true;
	DBRule singleRule;
	for (int iRule = 0; iRule < ruleEngine->getDataContext()->ruleList.size(); iRule++) {
		//check every singel rule
		singleRule = ruleEngine->getDataContext()->ruleList[iRule];
		//将来用函数指针取代switch case
		int iPhase = singleRule.phase;

		if (iPhase != (int)PHASE::PHASE_PLANNING) continue;

		switch (singleRule.function)
		{
		case RULES::MAX_FDP_PERDUTY_R4:
			isLegal = ruleEngine->checkFDPPerDutyByDuty_R4(duty, nullptr, &singleRule);
			break;
		default:
			printf("No rule to be checked.\n");
		}

	}

	return isLegal;
}


//20151021 comment by ain : 解决 RULE_MESSAGE undefined 问题
//RULE_MESSAGE checkRules_RE(string idCrew, vector<long long> rosterVec){
//	vector<RULE_LEGALITY *> checkList;
//	CREW cCrew;
//	for (vector<SharedPtr<CREW>>::iterator iter = ruleEngine->getCrewContext()->crewList.begin(); iter != ruleEngine->getCrewContext()->crewList.end(); iter++){
//		if ((*iter).idCrew == idCrew){
//			cCrew = (*iter);
//			break;
//		}
//	}
//	
//	for (vector<SharedPtr<ROSTER>> ::iterator iter = cCrew.rosterList.begin(); iter != cCrew.rosterList.end(); iter++){
//		for (vector<long long>::iterator iter1 = rosterVec.begin(); iter1 != rosterVec.end(); iter1++){
//			if ((*iter)->rosterId == (*iter1))
//				(*iter)->needRuleCheck = true;
//			else
//				(*iter)->needRuleCheck = false;
//		}
//	}
//	RULE_MESSAGE message ;
//
//	return message;
//}


//__declspec(dllexport) SharedPtr<ROSTER> syncRoster(string idCrew, Pairing* pairing, string &rank, bool isAdd){
//	
//	SharedPtr<CREW> cCrew;
//	for (vector<SharedPtr<CREW>>::iterator iter = ruleEngine->getCrewContext()->crewList.begin(); iter != ruleEngine->getCrewContext()->crewList.end(); iter++){
//		if ((*iter)->idCrew == idCrew){
//			cCrew = (*iter);
//			break;
//		}
//	}
//	SharedPtr<ROSTER> shareReturn;
//	if (isAdd)
//		shareReturn = ruleEngine->getCrewContext()->addRoster(cCrew, pairing, rank, true);
//	else
//		shareReturn = ruleEngine->getCrewContext()->delRoster(cCrew, pairing, rank);
//	return shareReturn;
//
//}

__declspec(dllexport) void loadData(int scenarioId)
{

	if (!ruleEngine)
		ruleEngine = new LegalityChecker(0, false);

	ruleEngine->initializeDB(scenarioId);

}

__declspec(dllexport) map<string, map<string, vector<int>>> getPGComposition(Pairing * pg){
	vector<Duty *> duties = pg->getDutyVec();
	map<string, map<string, vector<int>>> comp, compTemp,result;
	for (vector<Duty*>::iterator it = duties.begin(); it != duties.end(); it++){
		Duty::DUTY_TYPE dt = (*it)->getType();
		if (dt == Duty::DUTY_PAIRING_REST || dt == Duty::DUTY_BLANK_DAY)
		{
			continue;
		}
		compTemp = ruleEngine->calculateComposition((*it));
		if (it == duties.begin()){
			comp = ruleEngine->calculateComposition((*it));
			continue;
		}
		
		for (map<string, map<string, vector<int>>>::iterator itTemp = comp.begin(); itTemp != comp.end();)
		{
			string compName = (*itTemp).first;
			map<string, map<string, vector<int>>>::iterator bFound = compTemp.find(compName);
			if (bFound == compTemp.end())
			{
				map<string, map<string, vector<int>>>::iterator temp = comp.erase(itTemp);
				itTemp = temp;
			}
			else
				itTemp++;
		}

		//比较两个Duty的配比：PLN相等情况下，OPEN取最小值
		for (map<string, map<string, vector<int>>>::iterator it2 = compTemp.begin(); it2 != compTemp.end(); it2++){
			string composition = (*it2).first;
			
			map<string, map<string, vector<int>>>::iterator pgFound = comp.find(composition);
			if (pgFound != comp.end()){
				map<string, vector<int>>* compDetail = &((*it2).second);
				map<string, vector<int>>* pgcompDetail = &((*pgFound).second);
				for (map<string, vector<int>>::iterator itTemp = compDetail->begin(); itTemp != compDetail->end(); itTemp++){
					string rank = (*itTemp).first;
					map<string, vector<int>>::iterator rankFound = pgcompDetail->find(rank);
					if (rankFound != pgcompDetail->end()){
						vector<int>* pgPlnFill = &((*rankFound).second);
						vector<int>* dutyPlnFill = &((*itTemp).second);
						if (pgPlnFill->at(0) != dutyPlnFill->at(0)){
							printf("Assert Error.");
						}
						else
						{
							pgPlnFill->at(1) = min(pgPlnFill->at(1), dutyPlnFill->at(1));
						}
					}
				}
			}
			
		}

	}
	return comp;
}

//传配比的PLAN和OPEN值 map<string, map<string, vector<int>>>，分别是配比名称，Rank名称，PLN和OPEN值
__declspec(dllexport) map<string, map<string, vector<int>>> getDutyComposition(Duty * duty){
	return ruleEngine->calculateComposition(duty);
}

__declspec(dllexport) bool checkBaseBasicRules(Pairing* pairing){

	bool isLegal = true;
	DBRule singleRule;
	for (int iRule = 0; iRule < ruleEngine->getDataContext()->ruleList.size(); iRule++) {
		//check every singel rule
		singleRule = ruleEngine->getDataContext()->ruleList[iRule];
		//将来用函数指针取代switch case
		int iPhase = singleRule.phase;

		if (iPhase != (int)PHASE::PHASE_PLANNING) continue;

		switch (singleRule.function)
		{
		case RULES::PAIRING_LIMITATION:
			isLegal = ruleEngine->checkPairingLimitation(pairing, &singleRule);
			break;
		default:
			printf("No rule to be checked.\n");
		}

	}

	return isLegal;

}

//PO interface
__declspec(dllexport) bool checkRules_PO(Duty * duty){
	vector<Duty*> duties;
	duties.push_back(duty);
	vector<int> rules;
	return ruleEngine->checkPGRules(duties, rules);
}

//PO interface
__declspec(dllexport) int checkRules_pairings(vector<Pairing*> pairings){
	int iReturn = 0;
	vector<int> rules;
	for (vector<Pairing*>::iterator ite = pairings.begin(); ite != pairings.end(); ++ite){
		vector<Duty*> duties = (*ite)->getDutyVec();
		iReturn = ruleEngine->checkPGRules(duties, rules);
	}

	return iReturn;
}


__declspec(dllexport) void release_DB(){
	ruleEngine->releaseDB();
}

__declspec(dllexport) void calculateFDP(Duty* duty){
	CalculationManday FDP = ruleEngine->getDataContext()->calculationMandayMap["FDP"];
	duty->calculateFDP(0, FDP.str, FDP.end);
}
