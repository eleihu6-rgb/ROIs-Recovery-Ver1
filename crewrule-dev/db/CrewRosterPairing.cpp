#include <stdio.h>
#include <vector>
#include <sstream>
#include <algorithm>    // std::sort
#include <time.h>
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "Log/Logger.h"

void makeRosterCrewIndex(vector<SharedPtr<CREW>> &crewList, vector<SharedPtr<ROSTER>> rosterList) {
	vector<SharedPtr<CREW>>::iterator crewIndex;
	int rosterIndex = 0;
	int count = 0;
	map<string, SharedPtr<CREW>> crewIdMap;
	//FILE * fp = NULL;
	//fp = fopen("../index-roster-crew.txt", "w");

	for (auto& c : crewList) {
		crewIdMap[c->idCrew] = c;
	}

	for (auto& r : rosterList) {
		if (crewIdMap.find(r->idcrew) == crewIdMap.end()) {
			Logger::getRuleLogger()->error("ERROR: invalid data, roster={} , crew={} not in scenario", r->rosterId, r->idcrew.c_str());
			continue;
		}
		
		SharedPtr<CREW> c = crewIdMap[r->idcrew];
		c->rosterList.push_back(r);
	}


	//make index : crew -> roster 
	//for (crewIndex = crewList.begin(); crewIndex != crewList.end(); crewIndex++) {
	//	while (rosterIndex < rosterList.size()) {
	//		SharedPtr<ROSTER> &roster = rosterList[rosterIndex];

	//		if (roster->idcrew.compare(crewIndex->get()->idCrew) < 0) {
	//			//fprintf(fp, "roster,%s,<<,crew,%s\n", roster->idcrew.c_str(), crewIndex->idCrew.c_str());

	//		}
	//		else if (roster->idcrew.compare(crewIndex->get()->idCrew) == 0) {
	//			crewIndex->get()->rosterList.push_back(roster);
	//			count ++;
	//			//fprintf(fp, "roster,%s,==,crew,%s\n", roster->idcrew.c_str(), crewIndex->idCrew.c_str());
	//			roster->indexInRosterListOfCrew = crewIndex->get()->rosterList.size() - 1; //初始化 indexInRosterListOfCrew

	//		} else {
	//			//fprintf(fp, "roster,%s,>>,crew,%s\n", roster->idcrew.c_str(), crewIndex->idCrew.c_str());
	//			break;
	//		}
	//		rosterIndex++;
	//	}
	//}
	//Logger::getRuleLogger()->info("roster-crew matchCount={}", count);
	//fclose(fp);

	//fp = fopen("../index-roster-crew_all-crew.txt", "w");
	//for (crewIndex = crewList.begin(); crewIndex != crewList.end(); crewIndex++) {
	//	fprintf(fp, "%s\n", crewIndex->idCrew.c_str());
	//}
	//fclose(fp);
}

//
//将pairing与roster关联，要求roster按pairingId排序
int makePairingRosterIndex(vector<SharedPtr<ROSTER>> &rosterList, vector<Pairing*> &pairingList) {
	
	vector<SharedPtr<ROSTER>>::iterator roster;
	map<long long, Pairing*> pairingIdMap;
	int i = 0;

	int matchCount = 0;

	for (auto& p : pairingList) {
		pairingIdMap[p->getDbId()] = p;
	}

	for (auto& r : rosterList) {
		if (r->pairId == 0)
			continue;

		if (pairingIdMap.find(r->pairId) == pairingIdMap.end()) {
			Logger::getRuleLogger()->error("ERROR: invalid data, pairing={} not exists for roster={}", r->pairId, r->rosterId );
			continue;
		}
		
		r->pairing = pairingIdMap[r->pairId];
	}

	//for (roster = rosterList.begin(); roster != rosterList.end(); roster++) {
	//	while (i < pairingList.size()) {
	//		Pairing * pairingPtr = pairingList[i];

	//		if (pairingPtr->getDbId() < roster->get()->pairId ) {
	//			i++;
	//			if (i >= pairingList.size())
	//				break;
	//		}
	//		else if (pairingPtr->getDbId() == roster->get()->pairId) {
	//			roster->get()->pairing = pairingPtr;
	//			//i++;
	//			matchCount++;
	//			break;
	//		}
	//		else {
	//			break;
	//		}
	//	}
	//}
	Logger::getRuleLogger()->info("pairing-roster matchCount= {}", matchCount);
	return matchCount;
}


//假设crews和crewFleets都以按idcrew有序排列，从头遍历两列表建立关于idcrew的关联
//要求crew, roster按idcrew排序
void makeIndexCrewRoster(vector<SharedPtr<CREW>> &crews, vector<SharedPtr<ROSTER>> &rosters) {
	std::size_t crewIndex = 0;
	std::size_t rosterIndex = 0;

	for (crewIndex = 0; crewIndex < crews.size(); crewIndex++) {
		SharedPtr<CREW>& crew = crews[crewIndex];

		while (rosterIndex < rosters.size()) {
			SharedPtr<ROSTER> roster = rosters[rosterIndex];
			if (roster->idcrew.compare(crew->idCrew) < 0) {

			} else if (roster->idcrew.compare(crew->idCrew) == 0) {
				crew->rosterList.push_back(roster);

			} else {
				break;
			}
			rosterIndex++;
		}
	}
}
