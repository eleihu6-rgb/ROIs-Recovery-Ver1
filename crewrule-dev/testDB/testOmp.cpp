#include <stdio.h>
#include <time.h>
#include <iostream>
#include <sstream>
#include <fstream>
#include <string>
#include <omp.h>
#include "CrewDB.h"
#include "RuleEngine\RuleEngine.h"
#include "UtilFunc.h"
#include "OrLog.h"

struct crewPairingItem {
	string crewId;
	long long pairingId;
};

bool isEqualStrList(vector<string>& list1, vector<string>& list2) {
	if (list1.size() != list2.size())
		return false;
	map<string, string> m;
	for (auto& i : list1) {
		m[i] = i;
	}
	for (auto& i : list2) {
		if (m.find(i) == m.end())
			return false;
	}
	return true;
}

void test_is_valid_pairing_crew(SharedPtr<CrewDataContext>& dbData, LegalityChecker& ruleEngine) {

	int maxTurn = 10;
	string actingRank = dbData->scenario.actingRanks[0];
	cout << "actingRank=" << actingRank << endl;

	//单线程检查结果
	cout << utcToUtcString(time(0)) << " " << "single-thread start" << endl;
	unordered_map <long long, vector<string> > qualifiedCrewForPg;
	//unordered_map < string, vector<long long> > qualifiedPgForCrew;
	for (std::size_t j = 0; j < dbData->crewList.size(); j++)
	{
		SharedPtr<CREW>& crew = dbData->crewList[j];
		for (Pairing * pg : dbData->pairingListForRO)
		{
			bool isValid = ruleEngine.isCrewQualifyForPairing(crew, pg, actingRank);
			if (isValid)
			{
				//qualifiedPgForCrew[crew->idCrew].push_back(pg->getDbId());
				qualifiedCrewForPg[pg->getDbId()].push_back(crew->idCrew);
			}
		}
	}
	cout << utcToUtcString(time(0)) << " " << "single-thread end" << endl;

	//测试多线程检查，并汇总结果与单线程对比，循环多轮(turn)测试
	for (int turn = 0; turn < maxTurn; turn++)
	{
		cout << utcToUtcString(time(0)) << " " << "multi-thread " << turn << " start" << endl;
		vector<vector<crewPairingItem>> crewPairingValidList(4); //多线程结果各自保存
		{
			//多线程 isValidPairing检查
#pragma omp parallel for num_threads(4)  
			for (int j = 0; j < (int)dbData->crewList.size(); j++)
			{
				int threadNum = omp_get_thread_num();
				SharedPtr<CREW>& crew = dbData->crewList[j];
				//cout << utcToUtcString(time(0)) << " " <<  "for loop turn=" << turn << " crew=" << crew->idCrew << " thread=" << threadNum << endl;
				for (Pairing * pg : dbData->pairingListForRO)
				{
					bool isValid = ruleEngine.isCrewQualifyForPairing(crew, pg, actingRank);
					if (isValid)
					{
						crewPairingItem item;
						item.crewId = crew->idCrew;
						item.pairingId = pg->getDbId();
						crewPairingValidList[threadNum].push_back(item);
					}
				}
			}
		}
		//汇总multi-thread结果
		unordered_map <long long, vector<string> > qualifiedCrewForPg2;
		//unordered_map < string, vector<long long> > qualifiedPgForCrew2;
		for (auto& threadResult : crewPairingValidList) {
			for (auto& item : threadResult) {
				if (qualifiedCrewForPg2.find(item.pairingId) == qualifiedCrewForPg2.end())
					qualifiedCrewForPg2.insert(make_pair(item.pairingId, vector<string>()));
				qualifiedCrewForPg2[item.pairingId].push_back(item.crewId);

				//if (qualifiedPgForCrew2.find(item.crewId) == qualifiedPgForCrew2.end())
				//	qualifiedPgForCrew2.insert(make_pair(item.crewId, vector<long long>()));
				//qualifiedPgForCrew2[item.crewId].push_back(item.pairingId);
			}
		}
		cout << utcToUtcString(time(0)) << " " << "multi-thread " << turn << " end" << endl;

		//数据检查
		bool OK = true;
		if (qualifiedCrewForPg2.size() != qualifiedCrewForPg.size()) {
			cout << utcToUtcString(time(0)) << " " << "multi-thread vs single-thread not match" << endl;
			OK = false;
		}
		for (auto& e : qualifiedCrewForPg2) {
			if (qualifiedCrewForPg.find(e.first) == qualifiedCrewForPg.end()) {
				cout << utcToUtcString(time(0)) << " " << "multi-thread vs single-thread not match with pairing=" << e.first << endl;
				OK = false;
				break;
			}
			if (!isEqualStrList(e.second, qualifiedCrewForPg[e.first])) {
				cout << utcToUtcString(time(0)) << " " << "multi-thread vs single-thread not match with crewId" << endl;
				OK = false;
				break;
			}
		}
		if (OK) {
			cout << "SUCCESS size=" << qualifiedCrewForPg.size() << endl;
		}
		else {
			cout << "ERROR " << endl;
			//若出错则打印多线程结果
			ofstream of2("qualifiedCrewForPg2.txt");
			for (auto& p : qualifiedCrewForPg2) {
				of2 << "    " << p.first;
				for (auto& c : p.second)
					of2 << " " << c;
				of2 << "\n";
			}
			of2.close();
			break;
		}

	}
	//打印单线程结果，作为数据对比基准
	ofstream of1("qualifiedCrewForPg.txt");
	for (auto& p : qualifiedCrewForPg) {
		of1 << "    " << p.first;
		for (auto& c : p.second)
			of1 << " " << c;
		of1 << "\n";
	}
	of1.close();
}